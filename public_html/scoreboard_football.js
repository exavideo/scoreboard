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
var autocompletePenalties = [];
var clockState = { };
var lastStopTimeElapsed = 0;
var overtime_length = 0;
var down = 1;
var togo = 10;

function getJson(sourceurl, callback) {
    jQuery.ajax({
        url: sourceurl,
        dataType: "json",
        error: function(jqxhr, textStatus) {
            console.log("Communication failure: " + textStatus);
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
    var y = parseInt(x, 10);
    if (isNaN(y)) {
        return false;
    }

    return (x == y && x.toString() == y.toString());
}

function intOrZero(x) {
    if (isInt(x)) {
        return parseInt(x, 10);
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
        var periodField = $("#clockControl").find("#period");

        if (isRunning) {
            clockField.addClass("clock_running");
            clockField.removeClass("clock_stopped");
        } else {
            clockField.addClass("clock_stopped");
            clockField.removeClass("clock_running");
        }

        clockField.text(formatTime(tenthsRemaining));
        periodField.text(period);
    });
}

function updateClockTimeout( ) {
    updateClock( );
    setTimeout(updateClockTimeout, 100);
}

function updatePreviewTimeout( ) {
    $("#preview object").removeAttr("data").attr("data", "/preview?" + new Date().getTime());
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
        $(elem).find("#plusOne").click(function() { addPoints.call(this, 1); });
        $(elem).find("#plusTwo").click(function() { addPoints.call(this, 2); });
        $(elem).find("#plusThree").click(function() { addPoints.call(this, 3); });
        $(elem).find("#plusSix").click(function() { addPoints.call(this, 6); });

        $(elem).find("#shotOnGoal").click(shotTaken);
        $(elem).find("#takeTimeout").click(timeoutTaken);        
        $(elem).find("#minorPenalty").click(function() { newPenalty.call(this, 1200); });
        $(elem).find("#doubleMinorPenalty").click(function() { newPenalty.call(this, 2400); });
        $(elem).find("#majorPenalty").click(function() { newPenalty.call(this, 3000); });
        $(elem).find("#clearPenalties").click(clearPenalties);
        $(this).team().penaltyDialog().find("#clearAllPenalties").click(clearPenalties);
        $(elem).find("#editPenalties").click(editPenalties);
        $(elem).find("#emptyNet").click(emptyNet);

        $(elem).find("input,select").change(function() { $(this).team().putTeamData() });

        $(elem).find(".penalty_list").sortable({ 
            connectWith: $(elem).find(".penalty_list"),
            stop: function() { 
                $(this).team().putTeamData(); 
            }
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

jQuery.fn.newPenaltyDiv = function() {
    var penaltyDiv = $(this).penaltyDialog().find("#penaltyProto").clone(true);
    penaltyDiv.removeAttr('id');
    penaltyDiv.find("#player").autocomplete({ 
        source: $(this).data('roster'),
        change: $(this).change()
    });
    penaltyDiv.find("#penalty").autocomplete({ 
        source: autocompletePenalties,
        change: $(this).change()
    });

    penaltyDiv.find("#announcePenalty").click(function() { 
        penaltyDiv.announcePenalty( );     
    });
    penaltyDiv.find("#deletePenalty").click(deleteSinglePenalty);

    return penaltyDiv;
}

// newPenalty
// add a penalty to the team's penalty queue
function newPenalty(time) {
    var penaltyDiv = $(this).team().newPenaltyDiv();

    // set up penalty time correctly (creative selector abuse)
    penaltyDiv.find('select#time').val(time);

    // load announce strings
    penaltyDiv.find('input#player').val($(this).team().find('#penaltyPlayer').val());
    penaltyDiv.find('input#penalty').val($(this).team().find('#penaltyPenalty').val());
    $(this).team().find('#penaltyPlayer').val('')
    $(this).team().find('#penaltyPenalty').val('')

    // add to the shorter of the two penalty queues
    $(this).team().queuePenalty(penaltyDiv);

    // clear out any delayed penalty
    $(this).team().find('#delayedPenalty').removeAttr('checked');

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
        // flush expired penalties from queue
        $(q).penaltyQueueFlush( );

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

jQuery.fn.penaltyQueueFlush = function( ) {
    var penalty_end = $(this).find("#start").timeval();
    $(this).find(".penaltyData").each(function(i, p) {
        penalty_end = penalty_end + $(p).penaltyLength();
        console.log("penalty_end=" + penalty_end);
        console.log("time elapsed="+clockState.time_elapsed);
        if (penalty_end < clockState.time_elapsed) {
            console.log("flushing penalty??");
            // delete this expired penalty
            $(p).remove();
            // adjust queue start
            $(this).find("#start").timeval(penalty_end);
        }
    });
}

jQuery.fn.serializePenaltiesJson = function() {
    var json = { }
    json.activeQueueStarts = $(this).find(".penalty_queue").map(
        function(i,e) {
            return [$(e).find("#start").timeval()];
        }
    ).get();
    json.activeQueues = $(this).find(".penalty_queue").map(
        function(i,e) {
            return [$(e).serializePenaltyListJson()];
        }
    ).get();

    return json;
}

jQuery.fn.serializePenaltyListJson = function() {
    var json = this.find(".penaltyData").map(function(i,e) {
        return [$(e).serializeInputsJson()];
    }).get();

    return json;
}

jQuery.fn.announcePenalty = function( ) {
    var player = this.find("#player").val( );
    var penalty = this.find("#penalty").val( );
    var team = this.team( );

    var announces = [ team.find('#name').val( ) + ' PENALTY', player, penalty ];
    postJson('/announce', { messages : announces });
}

jQuery.fn.unserializePenaltiesJson = function(data) {
    this.find(".penalty_queue").each(function(i,e) {
        if (i < data.activeQueueStarts.length) {
            $(e).find("#start").timeval(data.activeQueueStarts[i]);
        }

        if (i < data.activeQueues.length) {
            $(e).unserializePenaltyListJson(data.activeQueues[i]);
        }
    });
}

jQuery.fn.unserializePenaltyListJson = function(data) {
    var thiz = this;
    $(this).penaltyQueueClear( );
    jQuery.each(data, function(i,e) {        
        var penaltyDiv = $(thiz).team().newPenaltyDiv();
        penaltyDiv.unserializeInputsJson(e);
        $(thiz).find(".penalty_list").append(penaltyDiv);
    });
}


// Clear the penalty queue.
jQuery.fn.penaltyQueueClear = function() {
    $(this).find(".penaltyData").remove();
}

// Set the penalty queue's start time to now.
jQuery.fn.penaltyQueueStartNow = function() {
    $(this).find("#start").timeval(clockState.time_elapsed);
    $(this).team().putTeamData();
}

jQuery.fn.timeval = function(tv) {
    /* FIXME: allow for 20 min playoff overtimes */
//  var overtime_length = 5*60*10;
    var period_length = 20*60*10;
    var n_periods = 3;

    if (typeof tv === 'number') {
        // set value
        var period = 0;
        var overtime = 0;

        console.log('parsing timeval ' + tv);

        while (tv >= period_length && period < n_periods) {
            tv -= period_length;
            period++;
        }

        console.log('period ' + period);

        while (period == n_periods && tv >= overtime_length) {
            tv -= overtime_length;
            overtime++;
        }

        console.log('overtime ' + overtime + ' length ' + overtime_length);

        var c_length;

        period = period + overtime;

        if (period >= n_periods) {
            c_length = overtime_length;
        } else {
            c_length = period_length;
        }
        
        tv = c_length - tv;

        console.log('tv ' + tv)

        this.val(formatTime(tv) + ' ' + (period+1));
    } else {
        // parse value
        var val = this.val( );
        var re = /((\d+):)?(\d+)(.(\d+))? (\d)/
        var result = re.exec(val);

        if (result) {
            var minutes = result[2];
            var seconds = result[3];
            var tenths = result[5];
            var period = result[6];
            var parsed = 0;
            var period_num = 0;
            var overtime_num = 0;
            var c_length = period_length;

            if (typeof minutes !== 'undefined') {
                parsed = parsed + parseInt(minutes, 10) * 600;
            }

            if (typeof seconds !== 'undefined') {
                parsed = parsed + parseInt(seconds, 10) * 10;
            }

            if (typeof tenths !== 'undefined') {
                parsed = parsed + parseInt(tenths, 10);
            }


            if (typeof period !== 'undefined') {
                period_num = parseInt(period, 10) - 1;
            } else {
                /* period_num = current period */
            }

            /* adjust for overtime */
            if (period_num >= 3) {
                overtime_num = period_num - 3;
                period_num = 3;
                c_length = overtime_length;
            }

            /* convert from time remaining to time elapsed */
            if (parsed > c_length) {
                parsed = c_length; 
            }
            parsed = c_length - parsed;
            
            parsed += period_num * period_length;
            parsed += overtime_num * overtime_length;

            return parsed;
        }
    }
}


// Find the time at which a penalty queue will end.
// e.g. $("#homeTeam #pq1").penaltyQueueEnd()
// Return zero if no penalties are on the queue or they are all expired.
jQuery.fn.penaltyQueueEnd = function() {
    var total = 0;
    var time = clockState.time_elapsed;
    var penalty_end = intOrZero($(this).find("#start").timeval());
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
    return parseInt($(this).find("select option:selected").val(), 10);
}


// clearPenalties
// Clear all penalties on a team.
function clearPenalties() {
    $(this).team().penaltyDialog()
        .find(".penalty_queue .penaltyData").remove();
    $(this).team().putTeamData();
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
    $(this).penaltyQueue().find("#start").timeval(lastStopTimeElapsed);
}

function deleteSinglePenalty() {
    var pd = $(this).parents(".penaltyData");
    var tc = pd.team();
    pd.remove();
    tc.putTeamData();
}

// goalScored
// Stop clock and register a goal for the team.
function goalScored() {
    $(this).team().find("#score").val(
        intOrZero($(this).team().find("#score").val()) + 1
    );
    $(this).team().putTeamData();
    // trigger any kind of blinky goal animations (or whatever)
    viewCommand({"goal_scored_by" : $(this).team().data('url')});
}

// addPoints
// add points to a team's score
function addPoints(points) {
    $(this).team().find("#score").val(
        intOrZero($(this).team().find("#score").val()) + points
    );
    $(this).team().putTeamData();
    // trigger any kind of blinky goal animations (or whatever)
    if (points >= 3) {
        viewCommand({"goal_scored_by" : $(this).team().data('url')});
    }
}

function shotTaken() {
    $(this).team().find("#shotsOnGoal").val(
        intOrZero($(this).team().find("#shotsOnGoal").val()) + 1
    );
    $(this).team().putTeamData();
}

function timeoutTaken() {
    var tol = intOrZero($(this).team().find("#timeoutsLeft").val());
    if (tol > 0) {
        $(this).team().find("#timeoutsLeft").val(tol - 1);
        $(this).team().putTeamData();
        putJson('/status', { message : $(this).team().find("#name").val() + " TIMEOUT" });
    }
}

function emptyNet() {
    $(this).team().find("#status").val("EMPTY NET");
    $(this).team().putTeamData();
}

// lockControl
// Toggle whether the team setup controls are locked or unlocked.
function lockControl() {
    $(this).team().find("#lockableInputs input[type=text]").attr("disabled","disabled");
}

function unlockControl() {
    $(this).team().find("#lockableInputs input[type=text]").removeAttr("disabled");
}

// serializeInputsJson
// get values of all input fields within the matched elements as JSON
jQuery.fn.serializeInputsJson = function() {
    var result = { };
    $(this).find("input:text,select").each(function(i,e) {
        result[$(e).attr('id')] = $(e).val();
    });
    $(this).find("input:checkbox").each(function(i,e) {
        result[$(e).attr('id')] = $(e).is(':checked');
    });
    return result;
}

// unserializeInputsJson
// take all properties of the object and try to set field values 
jQuery.fn.unserializeInputsJson = function(data) {
    for (var prop in data) {
        $(this).find("input#"+prop).val(data[prop]);
        $(this).find("select#"+prop).val(data[prop]);
    }
}

jQuery.fn.getTeamData = function() {
    var thiz = this; // javascript can be counter-intuitive...
    getJson($(this).data('url'), function(data) {
        $(thiz).find("#lockableInputs").unserializeInputsJson(data);
        // important to set roster before we unserialize penalties
        // else autocompletion might fail
        $(thiz).data("roster", data.autocompletePlayers);
        $(thiz).penaltyDialog().unserializePenaltiesJson(data.penalties);
    });
}

// putTeamData
// Synchronize team data back to the server.
jQuery.fn.putTeamData = function() {
    var json = $(this).find("#lockableInputs").serializeInputsJson();
    json['penalties'] = $(this).penaltyDialog().serializePenaltiesJson();
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

function clearStatus() {
    putJson('/status', { message : "" });
}

function viewCommand(cmd) {
    putJson('/view_command', cmd);
}

function scoreboardUp() {
    viewCommand({'up':1});
}

function scoreboardDown() {
    viewCommand({'down':1});
}

function nextAnnounce() {
    viewCommand({'announce_next':1});
}

function setClock() {
    putJson('/clock', $("#clockSet").serializeInputsJson());
}

function toggleClock() {
	putJson('/clock/toggle', {});
}

function adjustClock(time) {
    putJson('/clock/adjust', { 'time' : time });
}

function periodAdvance(dummy) {
    putJson('/clock/advance', {});
}

function changeAutosync() {
    if ($("#autoSync").is(':checked')) {
        putJson('/autosync', { 'enabled' : true });
    } else {
        putJson('/autosync', { 'enabled' : false });
    }
}

function getAutosync() {
    getJson('/autosync', function(data) {
        if (data.enabled) {
            $("#autoSync").prop('checked',true);
        } else {
            $("#autoSync").prop('checked',false);
        }
    });
}

function getSettings() {
    getJson('/settings', function(data) {
        $("#otLengthCombo").val(data.otlen);
        overtime_length = data.otlen;
    }); 
}

function changeOtLength() {
    overtime_length = $("#otLengthCombo").val();
    putJson('/settings', { 'otlen' : overtime_length });
    $('.teamControl').team().each( function(index) { $(this).putTeamData(); } );
}

$(document).ready(function() {
    updateClockTimeout( );
    updatePreviewTimeout( );
    getAutosync( );
    getSettings( );
    updateDD( );

    $(".teamControl").buildTeamControl();
    // set up team URLs and load initial data
    $("#awayTeamControl").data('url','/team/0');
    $("#awayTeamControl").getTeamData();
    $("#homeTeamControl").data('url','/team/1');
    $("#homeTeamControl").getTeamData();

    $(".dialog").dialog({
        autoOpen: false,
        modal: true,
        resizable: false,
    });

    $("#startClock").click(startClock);
    $("#stopClock").click(stopClock);
	$("#toggleClock").click(toggleClock);
    $("#upSec").click( function() { adjustClock.call(this, 1000); } );
    $("#dnSec").click( function() { adjustClock.call(this, -1000); } );
    $("#upTenth").click( function() { adjustClock.call(this, 100); } );
    $("#dnTenth").click( function() { adjustClock.call(this, -100); } );
    $("#periodAdvance").click(periodAdvance);
    $("#announceControl #announce").click(postAnnounce);
    $("#announceControl #status").click(postStatus);
    $("#announceControl #clearStatus").click(clearStatus);
    $("#announceControl #nextAnnounce").click(nextAnnounce);
    $("#transitionControl #up").click(scoreboardUp);
    $("#transitionControl #down").click(scoreboardDown);
    $("#setClock").click(setClock);
    $("#autoSync").change(changeAutosync);
    $("#otLengthCombo").change(changeOtLength);

    $("#down1").click( function() { down = 1; updateDD(); } );
    $("#down2").click( function() { down = 2; updateDD(); } );
    $("#down3").click( function() { down = 3; updateDD(); } );
    $("#down4").click( function() { down = 4; updateDD(); } );
    $("#nextDown").click( function() { if (down < 4) { down += 1; } updateDD(); } );
    $("#firstAndTen").click( function() { down = 1; togo = 10; updateDD(); } );
    $("#toGoG").click( function() { togo = -1; updateDD(); } );
    $("#toGoI").click( function() { togo = 0; updateDD(); } );
    $("#toGo1").click( function() { togo = 1; updateDD(); } );
    $("#toGo2").click( function() { togo = 2; updateDD(); } );
    $("#toGo3").click( function() { togo = 3; updateDD(); } );
    $("#toGo4").click( function() { togo = 4; updateDD(); } );
    $("#toGo5").click( function() { togo = 5; updateDD(); } );
    $("#toGo6").click( function() { togo = 6; updateDD(); } );
    $("#toGo7").click( function() { togo = 7; updateDD(); } );
    $("#toGo8").click( function() { togo = 8; updateDD(); } );
    $("#toGo9").click( function() { togo = 9; updateDD(); } );
    $("#toGo10").click( function() { togo = 10; updateDD(); } );
    $("#toGo11").click( function() { togo = 11; updateDD(); } );
    $("#toGo12").click( function() { togo = 12; updateDD(); } );
    $("#toGo13").click( function() { togo = 13; updateDD(); } );
    $("#toGo14").click( function() { togo = 14; updateDD(); } );
    $("#toGo15").click( function() { togo = 15; updateDD(); } );
    $("#toGo16").click( function() { togo = 16; updateDD(); } );
    $("#toGo17").click( function() { togo = 17; updateDD(); } );
    $("#toGo18").click( function() { togo = 18; updateDD(); } );
    $("#toGo19").click( function() { togo = 19; updateDD(); } );
    $("#toGo20").click( function() { togo = 20; updateDD(); } );
    $("#toGoMinus5").click( function() { if (togo > 5) { togo -= 5; } updateDD(); } );
    $("#toGoPlus5").click( function() { togo += 5; updateDD(); } );
    $("#toGoEnter").click( customToGo );
    $("#showDD").click( showDD );
    $("#clearDD").click( clearDD );

});

function getDDText( ) {
    var downText = ["1st", "2nd", "3rd", "4th"];
    var togoText = togo;
    if (togo == -1) togoText = "Goal";
    if (togo == 0) togoText = "Inches";
    return downText[down - 1] + " & " + togoText;
}

function updateDD( ) {
    var field = $("#downAndDistance");
    field.text(getDDText());
}

function customToGo() {
    var customToGo = $("#toGoCustom").val();
    if ( isInt(customToGo) ) {
        togo = customToGo;
    }
    updateDD();
}

function showDD() {
    putJson('/downdist', { message : getDDText() });
}

function clearDD() {
    putJson('/downdist', { message : "" });
}

