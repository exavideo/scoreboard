# Copyright 2011 Exavideo LLC.
# 
# This file is part of Exaboard.
# 
# Exaboard is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
# 
# Exaboard is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# 
# You should have received a copy of the GNU General Public License
# along with Exaboard.  If not, see <http://www.gnu.org/licenses/>.


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
        @overtime_length = 5*60*10
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
            @period += 1
            if (@period > 3)
                @period_end += @overtime_length
            else
                @period_end += @period_length
            end
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

    def fgcolor
        @team_data['fgcolor']
    end

    def bgcolor
        @team_data['bgcolor']
    end

    def color
        bgcolor
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
        PenaltyHelper.new(@team_data['penalties'], @clock)
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
            qstart = @penalty_data['activeQueueStarts'][i].to_i
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
            qstart = @penalty_data['activeQueueStarts'][i].to_i
            qlength = queue_length(queue)
            qend = qstart + qlength
            time_remaining_on_queue = qend - @clock.time_elapsed

            if time_remaining_on_queue > 0
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
            time += penalty['time'].to_i
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

    def message
        if @announce.length > 0
            @announce[0]
        else
            ''
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

class ClockHelper
    def initialize(clock)
        @clock = clock
    end

    def time
        tenths = @clock.period_remaining

        seconds = tenths / 10
        tenths = tenths % 10

        minutes = seconds / 60
        seconds = seconds % 60

        if minutes > 0
            format '%d:%02d', minutes, seconds
        else
            format ':%02d.%d', seconds, tenths
        end
    end

    def period
        if @clock.period <= 3
            @clock.period.to_s
        elsif @clock.period == 4
            'OT'
        else
            (@clock.period - 3).to_s + 'OT'
        end
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
                'fgcolor' => '#ffffff',
                'bgcolor' => '#D40000',
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
                    # Only two players may serve penalties at a time. These arrays
                    # represent the "stacks" of penalties thus formed.
                    'activeQueues' => [ [], [] ],
                    
                    # These numbers represent the start time of each penalty "stack".
                    # 0 = start of game.
                    'activeQueueStarts' => [ 0, 0 ]
                },

                # roster autocompletion list
                'autocompletePlayers' => [
                ]
            },
            {
                'name' => 'UNION',
                'fgcolor' => '#ffffff',
                'bgcolor' => '#800000',
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
                ]
            }
        ]
    end

    put '/team/:id' do
        id = params[:id].to_i

        if id == 0 or id == 1
            Thread.exclusive { @teams[id].merge!(incoming_json) }
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
        @clock.period_remaining = incoming_json
        render :json => ''
    end

    put '/clock/running' do
        if incoming_json['run']
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
        if incoming_json.has_key? 'messages'
            @announces.concat(incoming_json['messages'])
        else
            @announces << incoming_json['message']
        end

        p @announces

        render :json => ''
    end

    put '/status' do
        @status = incoming_json['message']
        render :json => ''
    end

    put '/view_command' do
        command_queue << incoming_json
        p command_queue
        render :json => ''
    end

    get '/preview' do
        render :svg => @view.render_template
    end

    def view=(view)
        @view = view
        @view.announce = AnnounceHelper.new(@announces)
        @view.status = StatusHelper.new(@status)
        @view.home_team = TeamHelper.new(@teams[0], @clock)
        @view.away_team = TeamHelper.new(@teams[1], @clock)
        @view.clock = ClockHelper.new(@clock)
        @view.command_queue = command_queue
    end

    def view
        @view
    end

    self.files_dir = 'public_html'

protected
    def incoming_json
        unless params[:incoming_json]
            inp = environment['rack.input']
            inp.rewind
            params[:incoming_json] = JSON.parse inp.read
        end

        params[:incoming_json]
    end

    def command_queue
        @command_queue ||= []
        @command_queue
    end
end

module TimeHelpers
    def format_time_without_tenths(time)
        seconds = time / 10
        minutes = seconds / 60
        seconds = seconds % 60

        format "%d:%02d", minutes, seconds
    end

    def format_time_with_tenths_conditional(time)
        tenths = time % 10
        seconds = time / 10
        
        minutes = seconds / 60
        seconds = seconds % 60

        if minutes == 0
            format ":%02d.%d", seconds, tenths
        else
            format "%d:%02d", minutes, seconds
        end
    end
end

module ViewHelpers
    include TimeHelpers
end

class ScoreboardView
    include ViewHelpers

    def initialize(filename)
        @template = Erubis::Eruby.new(File.read(filename))
        galpha = 255
    end

    def render
        # override this to implement animations and stuff
        while command_queue.length > 0
            cmd = command_queue.shift
            if (cmd.has_key? 'down')
                galpha = 0
            elsif (cmd.has_key? 'up')
                galpha = 255
            elsif (cmd.has_key? 'announce_next')
                announce.next
            end
        end
        render_template
    end

    def render_template
        @template.result(binding)
    end

    attr_accessor :announce, :status, :home_team, :away_team, :clock
    attr_accessor :command_queue, :galpha
end

app = ScoreboardApp.new
app.view = ScoreboardView.new('andrew_scoreboard.svg.erb')
Thread.new { app.run(:Host => '::', :Port => 3001) }

galpha = 255

while true
    # prepare next SVG frame
    data = Thread.exclusive { app.view.render }
    # build header with data length and global alpha
    header = [ data.length, galpha ].pack('LC')

    # wait for handshake byte from other end
    if STDIN.read(1).nil?
        break
    end

    # send SVG data with header
    STDOUT.write(header)
    STDOUT.write(data)
end
