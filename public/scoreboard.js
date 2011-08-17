function initializeTeam() {
    var teamState = new Object( );
    
    teamState.penalties = new Array( );
    teamState.name = "RPI";
    teamState.color = "#D40000";
    teamState.score = 0;
    teamState.shotsOnGoal = 0;
    teamState.autocompletePlayers = []

    return teamState;
}

autocompletePenalties = [];

teamStates = new Array( );
teamStates[0] = initializeTeam( );
teamStates[1] = initializeTeam( );

teamControlPanels = new Array( )

function getJson(sourceurl, callback) {
    jQuery.ajax({
        url: sourceurl,
        dataType: "json",
        error: function(jqxhr, textStatus) {
            alert("Communication failure: " + textStatus);
        },
        success: function(data) {
            callback(data);
        }
    });
}

function putJson(desturl, obj) {
    jQuery.ajax({
        type: "PUT",
        url: desturl,
        contentType: "application/json",
        data: JSON.stringify(obj),
        error: function(jqxhr, textStatus) {
            alert("Communication error: " + textStatus);  
        }
    });
}

function postJson(desturl, obj) {
    jQuery.ajax({
        type: "POST",
        url: desturl,
        contentType: "application/json",
        data: JSON.stringify(obj),
        error: function(jqxhr, textStatus) {
            alert("Communication error: " + textStatus);  
        }
    });
}

jQuery.fn.appendButton = function(name, onClick, arg) {
    var button = $('<input type="button" />');
    var div = $('<div/>');

    button.click(function() { onClick(arg) });
    button.val(name)
    div.append(button);

    return this.append(div);
}

jQuery.fn.appendH1 = function(initialValue, id) {
    var h1 = $('<h1></h1>');
    h1.attr("id", id);
    return this;
}

jQuery.fn.ok_cancel_dialog = function(title, callback) {
    this.find().val(""); // clear out form
    this.dialog("option", "buttons", {
        "Cancel" : function( ) {
            $(this).dialog("close");
        },
        "OK" : function( ) {
            callback.apply(this);
        }
    });
    this.dialog("option", "title", title);
    this.dialog("open")
}

// Ask the user for a textual value and pass it to the callback if accepted.
function editText(title, callback) {
    // setup dialog for text input
    $("#edit_form").ok_cancel_dialog(title, function( ) {
        var value = $(this).find("#field").val( );
        $(this).dialog("close");
        callback(value);
    });
}

function isInt(x) {
    var y = parseInt(x);
    if (isNaN(y)) {
        return false;
    }

    return (x == y && x.toString() == y.toString());
}

// Ask the user for a numeric value. Pass it to the callback if accepted.
function editNumeric(title, callback) {
    // setup dialog for numeric input
    $("#edit_form").ok_cancel_dialog(title, function() {
        var val = $(this).find("#field").val( );
        if (isInt(val)) {
            $(this).dialog("close");
            callback(parseInt(val));
        } else {
            $(this).find("#field").addClass("ui-state-error");
        }
    });
}

function setupTeam(team) {
    editText(
        "Team Name",
        function(newValue) { 
            teamStates[team].name = newValue;
            updateTeamState(team);
        }
    );
}

function announceGoal(teamId) {
    var team = teamStates[teamId];

    // autocomplete player names
    $("#announce_goal_form").find("input").autocomplete({
        source: team.autocompletePlayers
    });

    $("#announce_goal_form").ok_cancel_dialog(
        team.name + " Goal",
        function() {
            // collect form data
            var scorer = "G: " + $(this).find("#scorer").val();
            var assisters = $(this).find("#assist").map(function(){ 
                var val = $(this).val( );
                if (val != "") {
                    return "A: " + val;
                }
            }).get( );

            // build announcement
            announce_data = [team.name + " GOAL", scorer].concat(assisters);
            postJson("/announce", announce_data);

            $(this).dialog("close");
        }
    );
}

function editShots(team) {
    editNumeric(
        "Shots on goal: " + teamStates[team].name,
        function(newValue) {
            teamStates[team].shotsOnGoal = newValue;
            updateTeamState(team);
        }
    );
}

function editScore(team) {
    editNumeric(
        "Score: " + teamStates[team].name, 
        function(newValue) {
            teamStates[team].score = newValue;
            updateTeamState(team);
        }
    );
}

function announcePenalty(teamId) {
    var team = teamStates[teamId];
    // autocomplete player names
    $("#announce_penalty_form").find("#player").autocomplete({
        source: team.autocompletePlayers
    });

    $("#announce_penalty_form").find("#penalty").autocomplete({
        source: autocompletePenalties
    });

    $("#announce_penalty_form").ok_cancel_dialog(
        team.name + " Penalty",
        function() {

        }
    );
    
}

function viewPenaltyQueues(team) {

}

function startClock(dummy) {

}

function stopClock(dummy) {

}

function generalAnnounce(dummy) {

}

function generalStatus(dummy) {

}

jQuery.fn.buildTeamPanel = function(teamId) {
    teamControlPanels[teamId] = this;
    return this
        .appendButton("Team Setup", setupTeam, teamId)
        .appendButton("Announce Goal", announceGoal, teamId)
        .appendButton("Edit Score", editScore, teamId)
        .appendButton("Shots on Goal", editShots, teamId)
        .appendButton("Announce Penalty", announcePenalty, teamId)
        .appendButton("Penalty Queue", viewPenaltyQueues, teamId);
}

jQuery.fn.buildGlobalPanel = function() {
    return this
        .appendButton("Start Clock", startClock, 0)
        .appendButton("Stop Clock", stopClock, 0)
        .appendButton("General Announce", generalAnnounce, 0)
        .appendButton("General Status", generalStatus, 0);
}

function updateTeamStateDisplay(teamId) {
    var teamState = teamStates[teamId];
    var teamPanel = teamControlPanels[teamId];

    teamPanel.find("#name").text(teamState.name);
    teamPanel.find("#score").text(teamState.score);
    teamPanel.find("#shots").text(teamState.shotsOnGoal);
}

function updateTeamStateAjax(teamId) {
    var team = teamStates[teamId];
    putJson("/team/" + teamId, team);
}

function updateTeamState(teamId) {
    updateTeamStateDisplay(teamId);
    updateTeamStateAjax(teamId);
}


function fetchTeamState(teamId) {
    getJson("/team/" + teamId, function(data) {
        alert(teamId);
        teamStates[teamId] = data;
        updateTeamStateDisplay(teamId);
    });
}

$(document).ready(function() {
    $("#global").buildGlobalPanel();
    $("#home_control").buildTeamPanel(0);
    $("#away_control").buildTeamPanel(1);

    fetchTeamState(0);
    fetchTeamState(1);

    $(".dialog").dialog({
        autoOpen: false,
        modal: true,
        resizable: false,
    });

});
