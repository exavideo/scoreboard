require 'sinatra'
require 'json'

$teams = [
    {
        'name' => 'RPI',
        'color' => '#D40000',
        'score' => 0,
        'shotsOnGoal' => 0,
        'penalties' => [],
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
        'penalties' => [],
        'autocompletePlayers' => [
            '#21 SUCKS'
        ]
    }
]

post '/announce' do
    request.body.rewind
    data = JSON.parse request.body.read

    p data
end

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

