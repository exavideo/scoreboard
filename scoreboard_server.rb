require 'sinatra'
require 'json'

$teams = [
    {
        # Team name
        'name' => 'RPI',
        # color value to be used for team name display.
        'color' => '#D40000',
        # number of points scored by this team
        'score' => 0,

        # shots on goal count (for hockey)
        'shotsOnGoal' => 0,

        # number of timeouts (for football)
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

$announces = []
$status = ''

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

post '/announce' do
    request.body.rewind
    data = JSON.parse request.body.read

    p data
end

$clock = GameClock.new

put '/team/:id' do
    id = params[:id].to_i

    request.body.rewind
    data = JSON.parse request.body.read

    if id == 0 or id == 1
        # FIXME??
        $teams[id] = data
        p $teams
        ''
    else
        404
    end
end

get '/team/:id' do
    id = params[:id].to_i
    if id == 0 or id == 1
        $teams[id].to_json
    else
        404
    end
end

put '/clock/period_remaining' do
    request.body.rewind
    data = JSON.parse request.body.read

    $clock.period_remaining = data
end

put '/clock/running' do
    request.body.rewind
    data = JSON.parse request.body.read

    if data['run']
        $clock.start
    else
        $clock.stop
    end
end

get '/clock' do
    {
        'running' => $clock.running?,
        'period_remaining' => $clock.period_remaining,
        'period' => $clock.period,
        'time_elapsed' => $clock.time_elapsed
    }.to_json
end

put '/announce' do
    request.body.rewind
    data = JSON.parse request.body.read

    $announces << data.message 
end

post '/status' do
    request.body.rewind
    data = JSON.parse request.body.read

    $status = data.message
end
