require 'patchbay'
require 'json'
require 'erubis'


class GameClock
    def initialize
        # Clock value, in tenths of seconds
        @value = 0
        @last_start = nil
        # 20 minutes, in tenths of seconds
        @period_length = 20*60*10
        @period_end = @period_length
        @period = 1
    end


    def time_elapsed
        if @last_start
            elapsed = Time.now - @last_start
            # compute the elapsed time in tenths of seconds

            value_now = @value + (elapsed * 10).to_i

            # we won't go past the end of a period without an explicit restart
            if value_now > @period_end
                value_now = @period_end
                @value = value_now
                @last_start = nil
            end

            value_now
        else
            @value
        end
    end

    attr_reader :period

    def start
        if @value == @period_end
            # FIXME: handle overtimes correctly...
            @period_end += @period_length
            @period += 1
        end

        @last_start = Time.now 
    end

    def stop
        @value = time_elapsed
        @last_start = nil
    end

    def running?
        if @last_start
            true
        else
            false
        end
    end

    def period_remaining=(tenths)
        @period_end = time_elapsed + tenths
    end

    def period_remaining
        @period_end - time_elapsed
    end
end

# the base data structure everything uses is a JSON format object.
# These are here to provide easier access to that data from views.
class TeamHelper
    def initialize(team_data, clock)
        @team_data = team_data
        @clock = clock
    end

    def name
        @team_data['name']
    end

    def color
        @team_data['color']
    end
    
    def score
        @team_data['score']
    end

    def shots
        @team_data['shotsOnGoal']
    end

    def timeouts
        @team_data['timeoutsLeft']
    end

    def called_timeout
        @team_data['timeoutNowInUse']
    end

    def penalties
        @penalty_helper ||= PenaltyHelper.new(team_data['penalties'], @clock)
        @penalty_helper
    end

    def strength
        penalties.strength
    end
end

class PenaltyHelper
    def initialize(penalty_data, clock)
        @penalty_data = penalty_data
        @clock = clock
    end

    def strength
        s = 5
        @penalty_data['activeQueues'].each_with_index do |queue, i|
            qstart = @penalty_data['activeQueueStarts'][i]
            qlength = queue_length(queue)
            if qlength > 0 and @clock.time_elapsed < qstart + qlength
                s -= 1
            end
        end

        s
    end

    def time_to_strength_change
        result = -1

        @penalty_data['activeQueues'].each_with_index do |queue, i|
            qstart = @penalty_data['activeQueueStarts'][i]
            qlength = queue_length(queue)
            qend = qstart + qlength
            time_remaining_on_queue = qend - @clock.time_elapsed

            if time_remaining > 0
                if time_remaining_on_queue < result or result == -1
                    result = time_remaining_on_queue 
                end
            end
        end

        if result == -1
            result = 0
        end

        result
    end

protected
    def queue_length(q)
        time = 0
        q.each do |penalty|
            time += penalty['time']
        end
        
        time
    end

end

class AnnounceHelper
    def initialize(announce_array)
        @announce = announce_array
        @announce_handled = false 
    end

    def bring_up
        if @announce_handled
            if @announce.length == 0
                @announce_handled = false
            end
            false
        else
            if @announce.length > 0
                @announce_handled = true
                true
            else
                false
            end
        end
    end

    def is_up
        @announce.length > 0
    end

    def next
        if @announce.length > 0
            @announce.shift
        else
            nil
        end
    end
end

class StatusHelper
    def initialize(app)
        @app = app
        @status_up = false
    end

    def text
        @app.status
    end

    def bring_up
        if @app.status != '' && !@status_up
            @status_up = true
            true
        else
            false
        end
    end

    def bring_down
        if @app.status == '' && @status_up
            @status_up = false
            true
        else
            false
        end
    end

    def is_up
        @app.status != '' 
    end
end

class ScoreboardApp < Patchbay
    def initialize
        super

        @clock = GameClock.new
        @teams = load_team_config
        @announces = []
        @status = ''
    end

    attr_reader :status

    def load_team_config
        # construct a JSON-ish data structure
        [
            {
                # Team name
                'name' => 'RPI',
                # color value to be used for team name display.
                'color' => '#D40000',
                # number of points scored by this team
                'score' => 0,

                # shots on goal count (for hockey)
                'shotsOnGoal' => 0,

                # number 
                # timeouts "left" don't include the one currently in use, if any
                'timeoutsLeft' => 3,
                'timeoutNowInUse' => false,

                # penalty queues (for hockey)
                # A penalty consists of player, penalty, length.
                'penalties' => {
                    # All penalties which have been announced, but not yet queued.
                    'announcedQueue' => [],

                    # Only two players may serve penalties at a time. These arrays
                    # represent the "stacks" of penalties thus formed.
                    'activeQueues' => [ [], [] ],
                    
                    # These numbers represent the start time of each penalty "stack".
                    # 0 = start of game.
                    'activeQueueStarts' => [ 0, 0 ]
                },

                # roster autocompletion list
                'autocompletePlayers' => [
                    '#30 YORK',
                    '#21 POLACEK',
                ]
            },
            {
                'name' => 'UNION',
                'color' => '#800000',
                'score' => 0,
                'shotsOnGoal' => 0,
                'timeoutsLeft' => 3,
                'timeoutNowInUse' => false,
                'penalties' => {
                    'announcedQueue' => [],
                    'activeQueues' => [ [], [] ],
                    'activeQueueStarts' => [ 0, 0 ]
                },
                'autocompletePlayers' => [
                    '#21 SUCKS'
                ]
            }
        ]
    end

    put '/team/:id' do
        id = params[:id].to_i

        request.body.rewind
        data = JSON.parse request.body.read

        if id == 0 or id == 1
            # trigger "goal" event
            if @teams[id]['score'] + 1 == data['score']
                if @view.respond_to? :on_goal
                    @view.on_goal(id)
                end
            end

            @teams[id] = data
            p @teams
            render :json => ''
        else
            render :json => '', :status => 404
        end
    end

    get '/team/:id' do
        id = params[:id].to_i
        if id == 0 or id == 1
            render :json => @teams[id].to_json
        else
            render :json => '', :status => 404
        end
    end

    put '/clock/period_remaining' do
        request.body.rewind
        data = JSON.parse request.body.read

        @clock.period_remaining = data
        render :json => ''
    end

    put '/clock/running' do
        request.body.rewind
        data = JSON.parse request.body.read

        if data['run']
            @clock.start
        else
            @clock.stop
        end

        render :json => ''
    end

    get '/clock' do
        render :json => {
            'running' => @clock.running?,
            'period_remaining' => @clock.period_remaining,
            'period' => @clock.period,
            'time_elapsed' => @clock.time_elapsed
        }.to_json
    end

    post '/announce' do
        request.body.rewind
        data = JSON.parse request.body.read

        @announces << data.message 

        render :json => ''
    end

    put '/status' do
        request.body.rewind
        data = JSON.parse request.body.read

        @status = data.message

        render :json => ''
    end

    get '/preview' do
        @view.render_template
    end

    def set_view(view)
        @view = view
        @view.announce = AnnounceHelper.new(@announce)
        @view.status = StatusHelper.new(@status)
        @view.home_team = TeamHelper.new(@teams[0])
        @view.away_team = TeamHelper.new(@teams[1])
    end

    def render_view
        @view.render
    end

    self.files_dir = 'public_html'
end

def ScoreboardView
    def initialize(filename)
        @template = Erubis::Eruby.new(File.read(filename))
    end

    def render
        # override this to implement animations and stuff
        render_template
    end

    def render_template
        @template.result({
            :announce => announce, :status => status, 
            :home_team => home_team, :away_team => away_team
        })         
    end

    attr_accessor :announce, :status, :home_team, :away_team
end

app = ScoreboardApp.new
app.run(:Host => '::', :Port => 3000)

