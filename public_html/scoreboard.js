/*
 * Copyright 2011 Exavideo LLC.
 * 
 * This file is part of Exaboard.
 * 
 * Exaboard is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * Exaboard is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with Exaboard.  If not, see <http://www.gnu.org/licenses/>.
 */

function initializeTeam() {
    var teamState = new Object( );
    
    teamState.penalties = new Object( );
    teamState.penalties.activeQueueStarts = [ 0, 0 ];
    teamState.penalties.activeQueues = [ new Array(), new Array() ];
    teamState.penalties.announcedQueue = new Array();
    teamState.name = "RPI";
    teamState.color = "#D40000";
    teamState.score = 0;
    teamState.shotsOnGoal = 0;
    teamState.autocompletePlayers = []
    teamState.timeoutsLeft = 3;
    teamState.timeoutNowInUse = false;

    return teamState;
}

autocompletePenalties = ["SUCKING"];

teamStates = new Array( );
teamStates[0] = initializeTeam( );
teamStates[1] = initializeTeam( );

teamControlPanels = new Array( );
penaltyQueues = new Array( );
penaltyQueues[0] = new Array( );
penaltyQueues[1] = new Array( );

clockState = new Object( )

lastStopTimeElapsed = 0;

function getJson(sourceurl, callback) {
    jQuery.ajax({
        url: sourceurl,
        dataType: "json",
        error: function(jqxhr, textStatus) {
            //alert("Communication failure: " + textStatus);
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
            //alert("Communication error: " + textStatus);  
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
            //alert("Communication error: " + textStatus);  
        }
    });
}

jQuery.fn.appendButton = function(name, onClick, arg) {
    var button = $('<button />');
    var div = $('<div/>');

    button.click(function() { onClick(arg) });
    button.text(name)
    div.append(button);

    return this.append(div);
}

jQuery.fn.buttonAfter = function(name, onClick) {
    var button = $('<button />');
    button.click(onClick);
    button.text(name);
    return this.after(button);
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
    
    // clear form
    $("#announce_penalty_form").find("input").val("");

    // set up autocompletion
    $("#announce_penalty_form").find("#penalty").autocomplete({
        source: autocompletePenalties
    });

    $("#announce_penalty_form").find("#player").autocomplete({
        source: team.autocompletePlayers
    });

    // show dialog
    $("#announce_penalty_form").ok_cancel_dialog(
        "Announce " + team.name + " Penalty", 
        function() {
            // make penalty object from form
            var penaltyObj = new Object();
            penaltyObj.player = $("#announce_penalty_form").find("#player").val();
            penaltyObj.penalty = $("#announce_penalty_form").find("#penalty").val();
            penaltyObj.time = $("#announce_penalty_form").find("#penaltyType").val();

            // add to team's "announced" queue
            team.penalties.announcedQueue.push(penaltyObj)

            // send back to server
            updateTeamState(teamId);

            $(this).dialog("close");
        }
    );
    
}

function populatePenaltyQueue(where, penalties) {
    $.each(penalties, function(i,p) {
        var entry = $('<li />');
        entry.addClass("penaltyEntry");
        entry.data("penaltyObj", p);
        entry.text(p.player + ' - ' + p.penalty
                + ' [' + p.time + ':00]');
        entry.appendButton(
            "Remove", 
            function() {
                entry.detach();    
            },
            null
        );
        where.append(entry);
    });
}

function extractPenaltyData(fromWhere) {
    return fromWhere.find("li")
        .map(function(i, x) { return $(x).data("penaltyObj") })
        .get();
}

function savePenaltyQueues(team) {
    team.penalties.activeQueues[0] = extractPenaltyData($("#pq1"));
    team.penalties.activeQueues[1] = extractPenaltyData($("#pq2"));
    team.penalties.announcedQueue = extractPenaltyData($("#pqa"));
}

function viewPenaltyQueues(team) {
    var team = teamStates[team];

    // empty the dialog
    $("#penalty_queue_dialog").find(".penaltyEntry").remove( );

    // populate penalty queues
    populatePenaltyQueue($("#penalty_queue_dialog").find("#pq1"), 
            team.penalties.activeQueues[0]);
    populatePenaltyQueue($("#penalty_queue_dialog").find("#pq2"),
            team.penalties.activeQueues[1]);
    populatePenaltyQueue($("#penalty_queue_dialog").find("#pqa"),
            team.penalties.announcedQueue);

    $("#penalty_queue_dialog").find("#clearAllPenalties").click(function() {
        $("#penalty_queue_dialog").find(".penaltyEntry").remove( );
    });
    

    // ready to go (in theory...)
    $("#penalty_queue_dialog").dialog("option", "width", "800");
    $("#penalty_queue_dialog").dialog("option", "height", "600");
    $("#penalty_queue_dialog").ok_cancel_dialog(
        "Edit " + team.name + " Penalty Queue",
        function() { 
            savePenaltyQueues(team);
            $(this).dialog("close"); 
        }
    );

}

function useTimeout(teamId) {
    var team = teamStates[teamId];
    
    if (team.timeoutsLeft > 0) {
        stopClock(0);
        team.timeoutsLeft = team.timeoutsLeft - 1;
        team.timeoutNowInUse = true;
        updateTeamState(teamId);
    }
}

function startClock(dummy) {
    // save the time for penalties
    lastStopTimeElapsed = clockState.time_elapsed;

    // clear out any ongoing timeouts 
    teamStates[0].timeoutNowInUse = false;
    teamStates[1].timeoutNowInUse = false;
    updateTeamState(0);
    updateTeamState(1);

    putJson('/clock/running', { 'run' : true }); 
}

function stopClock(dummy) {
    putJson('/clock/running', { 'run' : false });
}

function formatTime(tenthsClock) {
    var tenths = tenthsClock % 10;
    var seconds = Math.floor(tenthsClock / 10);
    var minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;

    var result = minutes + ":";
    if (seconds < 10) {
        result += "0";
    } 
    result += seconds;
    result += "." + tenths;
    return result;
}

function updateClock( ) {
    getJson('/clock', function(data) {
        clockState = data;

        var tenthsRemaining = data.period_remaining;
        var period = data.period;
        var isRunning = data.running;

        var clockField = $("#global").find("#clock");

        if (isRunning) {
            clockField.addClass("clock_running");
            clockField.removeClass("clock_stopped");
        } else {
            clockField.addClass("clock_stopped");
            clockField.removeClass("clock_running");
        }

        clockField.text(formatTime(tenthsRemaining) + " " + period);
    });
}

function generalAnnounce(dummy) {
    editText("General Announcement", function(text) {
        postJson("/announce", { message : text });
        $(this).dialog("close");
    });
}

function generalStatus(dummy) {
    editText("General Status Message", function(text) {
        putJson("/status", { message : text });
        $(this).dialog("close");
    });
}

jQuery.fn.buildTeamPanel = function(teamId) {
    teamControlPanels[teamId] = this;
    return this
        .appendButton("Team Setup", setupTeam, teamId)
        .appendButton("Announce Goal", announceGoal, teamId)
        .appendButton("Use Timeout", useTimeout, teamId)
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
    teamPanel.find("#timeouts").text(teamState.timeoutsLeft);
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
        teamStates[teamId] = data;
        updateTeamStateDisplay(teamId);
    });
}

function updateClockTimeout( ) {
    updateClock( );
    setTimeout(updateClockTimeout, 100);
}

function updatePreviewTimeout( ) {
    $("#preview img").removeAttr("src").attr("src", "/preview?" + new Date().getTime());
    setTimeout(updatePreviewTimeout, 1000);
}

function addPenaltyTimeButtons(where) {
    where.buttonAfter("Last Clock Start", function() {
        where.val(lastStopTimeElapsed); 
    }).buttonAfter("Time Now", function() { 
        where.val(clockState.time_elapsed);
    });
}

$(document).ready(function() {
    $("#global").buildGlobalPanel();
    $("#home_control").buildTeamPanel(0);
    $("#away_control").buildTeamPanel(1);

    fetchTeamState(0);
    fetchTeamState(1);
    updateClockTimeout( );
    updatePreviewTimeout( );

    $(".dialog").dialog({
        autoOpen: false,
        //modal: true,
        resizable: false,
    });

    $(".penalty_list").sortable({ connectWith: ".penalty_list" });

    addPenaltyTimeButtons($("#pq1start"));
    addPenaltyTimeButtons($("#pq2start"));

});
