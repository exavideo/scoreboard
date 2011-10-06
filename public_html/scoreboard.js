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


"use strict";
var autocompletePenalties = ["SUCKING"];
var clockState = { };
var lastStopTimeElapsed = 0;

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

function fieldsetToJson(fieldset) {
    var fields = fieldset.serializeArray();
    var result = { };
    $.each(fields, function(i, field) {
        result[field.name] = field.value;
    });

    return result;
}

function isInt(x) {
    var y = parseInt(x);
    if (isNaN(y)) {
        return false;
    }

    return (x == y && x.toString() == y.toString());
}

function intOrZero(x) {
    if (isInt(x)) {
        return parseInt(x);
    } else {
        return 0;
    }
}

function startClock(dummy) {
    // save the time for penalties
    lastStopTimeElapsed = clockState.time_elapsed;
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

        var clockField = $("#clockControl").find("#clock");

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

function updateClockTimeout( ) {
    updateClock( );
    setTimeout(updateClockTimeout, 100);
}

function updatePreviewTimeout( ) {
    $("#preview img").removeAttr("src").attr("src", "/preview?" + new Date().getTime());
    setTimeout(updatePreviewTimeout, 1000);
}

jQuery.fn.buildTeamControl = function() {
    $(this).each(function(index, elem) {
        $(elem).html($("#teamProto").html());

        // hang onto this because jQuery will move it later
        $(elem).data("penaltyDialog", $(elem).find("#penalty_queue_dialog"));
        $(elem).find("#penalty_queue_dialog").data("team", $(elem));

        $(elem).find("#lockControl").click(lockControl);
        $(elem).find("#unlockControl").click(unlockControl);
        $(elem).find("#goal").click(goalScored);
        $(elem).find("#minorPenalty").click(function() { newPenalty.call(this, 1200); });
        $(elem).find("#majorPenalty").click(function() { newPenalty.call(this, 3000); });
        $(elem).find("#clearPenalties").click(clearPenalties);
        $(elem).find("#editPenalties").click(editPenalties);

        $(elem).find("input,select").change(function() { $(this).team().putTeamData() });

        $(elem).find(".penalty_list").sortable({ 
            connectWith: $(elem).find(".penalty_list"),
            change: function() { $(this).team().putTeamData() }
        });
        $(elem).find(".penalty_queue").build_penalty_queue();
    });
}

jQuery.fn.build_penalty_queue = function() {
    $(this).each(function(index, elem) {
        $(elem).find("#now").click(penaltyQueueStartNow);
        $(elem).find("#last").click(penaltyQueueStartLastStop);
    });
}

jQuery.fn.team = function() {
    var teamControl = $(this).closest(".teamControl");

    if (teamControl.length == 0) {
        return $(this).closest("#penalty_queue_dialog").data("team");
    } else {
        return teamControl;
    }
}

jQuery.fn.penaltyQueue = function() {
    return $(this).closest(".penalty_queue");
}

jQuery.fn.penaltyDialog = function() {
    return $(this).data("penaltyDialog");
}

// newPenalty
function newPenalty(time) {
    var penaltyDiv = $(this).team().penaltyDialog().find("#penaltyProto").clone();

    penaltyDiv.removeAttr('id');

    // set up penalty time correctly (creative selector abuse)
    penaltyDiv.find('select#penaltyType').val(time)

    // add to the shorter of the two penalty queues
    $(this).team().queuePenalty(penaltyDiv);

    // sync team data
    $(this).team().putTeamData();
}

// queuePenalty
jQuery.fn.queuePenalty = function(penalty_div) {
    var penaltyQueues = $(this).penaltyDialog().find(".penalty_queue");
    
    var min_queue_end = -1;
    var queue_with_min_end = 0;

    // find which queue has the shortest length
    penaltyQueues.each(function(i, q) {
        var qend = $(q).penaltyQueueEnd();
        if (qend < min_queue_end || min_queue_end == -1) {
            min_queue_end = qend;
            queue_with_min_end = i;
        }
    });

    // queue the penalty
    var queue = penaltyQueues[queue_with_min_end]
    if ($(queue).penaltyQueueEnd() == 0) {
        // start penalty queue now if it had no penalties or just expired ones
        $(queue).penaltyQueueClear();
        $(queue).penaltyQueueStartNow();
    }

    $(queue).find(".penalty_list").append(penalty_div);
}

jQuery.fn.penaltiesJson = function() {
    var json = { }
    json.activeQueueStarts = $(this).find(".penalty_queue").map(
        function(i,e) {
            return [$(e).find("#start").val()];
        }
    ).get();
    json.activeQueues = $(this).find(".penalty_queue").map(
        function(i,e) {
            return [$(e).penaltyListJson()];
        }
    ).get();

    return json;
}

jQuery.fn.penaltyListJson = function() {
    var json = $(this).find(".penaltyData").map(function(i,e) {
        return [$(e).serializeInputsJson()];
    }).get();

    return json;
}


// Clear the penalty queue.
jQuery.fn.penaltyQueueClear = function() {
    $(this).find(".penaltyData").remove();
}

// Start the penalty queue's start time to now.
jQuery.fn.penaltyQueueStartNow = function() {
    $(this).find("#start").val(clockState.time_elapsed);
}

// Find the time at which a penalty queue will end.
// e.g. $("#homeTeam #pq1").penaltyQueueEnd()
// Return zero if no penalties are on the queue or they are all expired.
jQuery.fn.penaltyQueueEnd = function() {
    var total = 0;
    var time = clockState.time_elapsed;
    var penalty_end = intOrZero($(this).find("#start").val());
    var count = 0;

    $(this).find(".penaltyData").each(function(i,e) {
        penalty_end = penalty_end + $(e).penaltyLength();
        count++;
    });

    if (penalty_end < time || count == 0) {
        return 0;
    } else {
        return penalty_end;
    }
}

// penaltyLength
// Find the length of a penalty...
// e.g. $("find_some_penalty_div").penaltyLength()
jQuery.fn.penaltyLength = function() {
    return $(this).find("select option:selected").val();
}


// clearPenalties
// Clear all penalties on a team.
function clearPenalties() {
    $(this).team().penaltyDialog()
        .find(".penalty_queue .penaltyData").remove();
}

// editPenalties
// Bring up penalty queue dialog box for a team.
function editPenalties() {
    $(this).team().penaltyDialog().dialog('option', 'width', 700);
    $(this).team().penaltyDialog().dialog('open');
}

// penaltyQueueStartNow
// Start the penalty queue now.
function penaltyQueueStartNow() {
    $(this).penaltyQueue().penaltyQueueStartNow();
}

// penaltyQueueStartLastStop
// Set penalty queue start time to last play stoppage
function penaltyQueueStartLastStop() {
    $(this).penaltyQueue().find("#start").val(lastStopTimeElapsed);
}

// goalScored
// Stop clock and register a goal for the team.
function goalScored() {

}

// lockControl
// Toggle whether the team setup controls are locked or unlocked.
function lockControl() {
    $(this).team().find("#lockableInputs input").attr("disabled","disabled");
}

function unlockControl() {
    $(this).team().find("#lockableInputs input").removeAttr("disabled");
}

jQuery.fn.serializeInputsJson = function() {
    var result = { };
    $(this).find("input,select").each(function(i,e) {
        result[$(e).attr('id')] = $(e).val();
    });
    return result;
}

// putTeamData
// Synchronize team data back to the server.
jQuery.fn.putTeamData = function() {
    var json = $(this).find("#lockableInputs").serializeInputsJson();
    json['penalties'] = $(this).penaltyDialog().penaltiesJson();
    putJson($(this).data('url'), json);
}

function announceStatusTextInput() {
    return $("#announceControl #textInput").val();
}

function postAnnounce() {
    postJson('/announce', { message : announceStatusTextInput() });     
}

function postStatus() {
    putJson('/status', { message : announceStatusTextInput() });
}

$(document).ready(function() {
    updateClockTimeout( );
    updatePreviewTimeout( );

    $(".teamControl").buildTeamControl();
    $("#homeTeamControl").data('url','/team/0');
    $("#awayTeamControl").data('url','/team/1');

    $(".dialog").dialog({
        autoOpen: false,
        modal: true,
        resizable: false,
    });

    $("#startClock").click(startClock);
    $("#stopClock").click(stopClock);
    $("#announceControl #announce").click(postAnnounce);
    $("#announceControl #status").click(postStatus);
});
