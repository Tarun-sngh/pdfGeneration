"use strict";

require('dotenv').config()
const {connectionDBPool} = require('./library/database');
let config = require('./config');
let AWS = require('aws-sdk');
let wkhtmltopdf = require('wkhtmltopdf');
const fs = require('fs');
const { format } = require('date-fns-tz');

AWS.config.update({ region: config.s3.Region });
let s3 = new AWS.S3();

function updatePdfToS3(key, filepath) {
	return new Promise((resolve, reject) => {
		console.log("uploading to s3...");

		s3.putObject({
			Bucket: config.s3.Bucket,
			Key: config.s3.BasePathWithFilePrefix + key,
			Body: fs.readFileSync(filepath),
			ContentType: "application/pdf",
			ACL: "public-read"
		}, function (error, data) {
			if (error != null) {
				console.log("error: " + error);
				return reject(error);
			}
			console.log('upload done...' + data);
			return resolve(key);
		});
	})
}

const generatePdfAndUpload = async (html, fileName) => {
	console.log("convert_html_into_pdf_and_upload...")
	return new Promise((resolve, reject) => {
        var output_filename = fileName + '.pdf';
		var tmp_pdf = '/tmp/' + output_filename;

		let wkhtml_stream = wkhtmltopdf(html,{
            pageSize: 'A2',
            lowquality: true,
            marginBottom : 3,
            marginLeft:1,
            marginRight:1,
            marginTop:3
        }).pipe(fs.createWriteStream('/tmp/' + output_filename));
		wkhtml_stream.on('finish', async () => {
            try{
                await updatePdfToS3(output_filename, tmp_pdf);
                return resolve(output_filename);
            }catch(error){
                return reject(error);
            }
		});
	})
}

function ucwords (str) {
    return (str + '').replace(/^([a-z])|\s+([a-z])/g, function ($1) {
        return $1.toUpperCase();
    });
}

const generateHtml = (findchallenge, findmatchplayers, findmatchdetails, findjoinedleauges) => {

    let datePattern = 'eee dd.MM.yyyy HH:mm:ss';
    let ISTStartDate = format(findmatchdetails.start_date, datePattern, { timeZone: 'Asia/Kolkata' });
    
    let content="";
    content=`<div class="col-md-12 col-sm-12" style="margin-top:20px;">
    <div class="col-md-12 col-sm-12 text-center" style="text-align:center">
    <div class="col-md-12 col-sm-12">
    <th> <strong>Fanadda</strong> </th><br>
    <th> <strong>Pdf Generated On: </strong>`+ISTStartDate+`</th>
    </div>
    </div>
    </div>`;
    content  +=`<div class="col-md-12 col-sm-12" style="margin-top:3px;">
    <div class="col-md-12 col-sm-12 text-center" style="background:#3C7CC4;text-align:center">
    <tr style="background:#3C7CC4;color:#fff;">`;
    let challengename = "";
    if(findchallenge.name==""){
        if(findchallenge.win_amount==0){
            challengename = 'Free Contest';
        }else{
            challengename = 'Contest-'+ findchallenge.win_amount;
        }
    }else{
        challengename = findchallenge.name;
    }
    content += '<th style="color:#fff !important;" colspan="' + (findmatchplayers.length+1) + '">' + challengename + ' ('+ findmatchdetails.short_name + ' ' + findmatchdetails.format + ' ' + ISTStartDate + `)</th>
    </tr>
    </div>
    <table rules="all" style="width:100%;border:1px solid black;border-collapse:collapse" >
    <tr style="background:#ccc;color:#333;text-align:left;font-size:09px;">
    <th style="width:8.3%">User(Team)</th>`;
    if(findmatchplayers.length != 0){
        let pn = 1;
        for( let player1 of findmatchplayers){
            if(pn < 12) {
                //content .='<th>'.ucwords($player1->name).'</th>';
                content +='<th style="width:8.3%">Player '+pn+'</th>';
            }
            pn++;
        }
    }
    content += '</tr>';
    if(findjoinedleauges.length != 0){
        for(let joinleauge of findjoinedleauges){

            content +=`<tr>
        <td style="text-align:left;font-size:09px;">`;
            if(joinleauge['team']!=""){
                let teamname = ucwords(joinleauge['team']);
                content +=teamname+' ('+joinleauge['teamnumber']+')';
            }
            else{
                let email = ucwords(joinleauge['email']);
                content += email +' ('+joinleauge['teamnumber']+')';
            }
            content +='</td>';
            let jointeam = joinleauge.players;
            let explodeplayers = jointeam.split(',');
            for(let player2 of findmatchplayers){
                //console.log(explodeplayers.includes(player2.playerid));
                if(explodeplayers.includes(`${player2.playerid}`)){
                    content +='<td class="text-centre" style="text-align:left;font-size:09px;">';
                    content += player2.name;

                    if(player2.playerid==joinleauge['vicecaptain']){
                        content += '(VC)';
                    }
                    if(player2.playerid==joinleauge['captain']){
                        content += '(C)';
                    }
                    content +='</td>';
                }

            }
            content +='</tr>';
        }
    }
    content += `</table>
    </div>`;
    return content;
}

module.exports.generatePdf = async (event) => {
// const generatePdf = async (event) => {
	let return_data = {};
	const headers = {
		'Access-Control-Allow-Origin': '*', // Required for CORS support to work
		'Access-Control-Allow-Credentials': true // Required for CORS support to work
	};
    let pdfStatus = '';
    let league_id_global_var = 0;
    let dbClient = null;
	try {

        console.log(event);
		let requestBody = event.Records[0].body.constructor === String ? JSON.parse(event.Records[0].body) : event.Records[0].body ;
        // let requestBody = event;
        let leagueId = (requestBody.leagueId) ? requestBody.leagueId : null;
        league_id_global_var = leagueId;
        
        dbClient = await connectionDBPool();
        
        const [challenge] = await dbClient.query(`SELECT * FROM match_challenges WHERE id= ${leagueId}`);
        
        if(typeof challenge == 'undefined'){
            throw new Error("Invalid LeagueId, please check the League Id");
        }else if(challenge.pdf_created == 1 || challenge.pdf_created == 4){
            throw new Error("Pdf already created");
        }

        pdfStatus = 'Preparing';

        let [matchPlayers, matchDetails, allJoinedUsers] = await Promise.allSettled([
            dbClient.query(`SELECT name,playerid FROM match_players WHERE matchkey= "${challenge.matchkey}"`),
            dbClient.query(`SELECT matchkey,title,short_name,start_date,format,name FROM list_matches WHERE matchkey= "${challenge.matchkey}"`),
            dbClient.query(`SELECT register_users.team, register_users.email, join_teams.players, join_teams.captain, join_teams.vicecaptain, join_teams.teamnumber, joined_leagues.id AS joinedid, pdfcreate, joined_leagues.challengeid FROM joined_leagues JOIN join_teams ON joined_leagues.teamid = join_teams.id JOIN register_users ON register_users.id = joined_leagues.userid WHERE challengeid= ${challenge.id}`)
        ]);
        
        for(let promises of [matchPlayers, matchDetails, allJoinedUsers]){
            if(promises.status == 'rejected'){
                throw new Error(promises.reason);
            };
        };

        if(matchPlayers["value"].length == 0){
            throw new Error("No data for given match_key in Match_players table");
        }else if(matchDetails["value"].length == 0){
            throw new Error("No data for given match_key in List_matches table");
        }

		let html = generateHtml(challenge, matchPlayers.value, matchDetails.value[0], allJoinedUsers.value);
        console.log(html);

		if (html == null) {
			return {
				statusCode: 200,
				headers: headers,
				body: JSON.stringify({
					status: false,
					'message': "Invalid Argument. HTML not found"
				})
			};
		}

        let pdfName = leagueId;
		let s3_pdf_basename = await generatePdfAndUpload(html, pdfName);
		let s3_pdf_url = config.s3.Bucket + '.s3.'+ config.s3.Region + '.amazonaws.com/' +  config.s3.BasePathWithFilePrefix + s3_pdf_basename;
        console.log(s3_pdf_url);

        await dbClient.query(`UPDATE match_challenges SET pdf_created = 4 WHERE id= ${leagueId}`);
        pdfStatus = 'Saved';

        dbClient.destroy();

		return_data = {
			status: true,
			message: "success",
			result: s3_pdf_url
		};
		return {
			statusCode: 200,
			headers: headers,
			body: JSON.stringify(return_data),
		};
	} catch (error) {
        console.log(error);
        if(dbClient != null){
            if(pdfStatus == 'Preparing'){
                console.log('Process failed so changing pdf_Created to 2');
                await dbClient.query(`UPDATE match_challenges SET pdf_created = 2 WHERE id= ${league_id_global_var}`);
            }
            console.log('killing db connection');
            dbClient.destroy();
        }
		return {
			statusCode: 200,
			headers: headers,
			body: JSON.stringify({
				status: false,
				'message': "Something went wrong. Please try again",
				error: error
			})
		};
	}
};

// generatePdf({
//     "leagueId": 1008605
//     //"matchKey": "c.match.final_match.ed141"
//   });