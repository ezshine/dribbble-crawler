import got from 'got';
import * as cheerio from 'cheerio';
import fs from 'fs';
import fetch from 'node-fetch'
import File from 'fetch-blob/file.js'
import { fileFromSync } from 'fetch-blob/from.js'
import { FormData } from 'formdata-polyfill/esm.min.js'

querytype="app";

const imgcompress = 1;
const imgsize = "840x630";
const isDebug = true;

if(!fs.existsSync("images")){
	fs.mkdirSync("images");
}

async function requestDribbblePage(q,page,total){
	//每页最多就24条
	console.log("准备爬取第"+page+"页数据");
	//https://dribbble.com/search/shots/popular?timeframe=week&q=logo&page=2&per_page=24&exclude_shot_ids=%2C17657041%2C17654125%2C17666947%2C17208391%2C17659035%2C17669103%2C17686941%2C17690288%2C17677880%2C17672150%2C17677896%2C17677927%2C17669870%2C17695671%2C17681301%2C17656204%2C17685682%2C17658944%2C17667344%2C17695789%2C17697669%2C17678001%2C17677814%2C17689214&timeframe=week
	let res;
	try{
		res = await got("https://dribbble.com/search/shots/popular?timeframe=now&q="+q+"&page="+page+"&per_page=24").text();
	}catch(err){
		console.log(err);
	}
	// console.log(res);

	const $ = cheerio.load(res);

	const allShots = $("li.shot-thumbnail.js-thumbnail");
	const length = allShots.length;

	for(let i = 0;i<length;i++){
		console.log("第"+(i+1)+"条数据处理中");
		var shotItem = allShots[i];

		var postObj = {
			type:q
		};

		var title = $(shotItem).children(".js-thumbnail-base").children(".shot-thumbnail-overlay").children(".shot-thumbnail-overlay-content").children(".shot-title").html();
		console.log(title);

		var shotId = $(shotItem).attr("data-thumbnail-id");
		console.log(shotId);

		var author = $(shotItem).children(".shot-details-container").find(".display-name").text();

		console.log(author);

		postObj["title"]=title;
		postObj["author"]=author;

		var hasVideo = $(shotItem).children(".js-thumbnail-base").hasClass("video");
		console.log("hasVideo:"+hasVideo);

		if(hasVideo){
			var videourl = $(shotItem).children(".js-thumbnail-base").attr("data-video-teaser-large");//small,medium,large
			await download(videourl,"images/"+shotId+"_1.mp4");

			postObj["video"]=videourl;
		}

		console.log("第"+(i+1)+"条数据处理结束");
	}

	if(page<total){
		requestDribbblePage(q,page+1,total);
	}else{
		//todo merge video
	}
}

async function download(url, fileName){
	console.log(url);
 	return new Promise((resolve,reject)=>{
 		const downloadStream = got.stream(url);
		const fileWriterStream = fs.createWriteStream(fileName);

		downloadStream
		  .on("downloadProgress", ({ transferred, total, percent }) => {
		    const percentage = Math.round(percent * 100);
		    console.error(`progress: ${transferred}/${total} (${percentage}%)`);
		  })
		  .on("error", (error) => {
		  	reject();
		    console.error(`Download failed: ${error.message}`);
		  });

		fileWriterStream
		  .on("error", (error) => {
		    console.error(`Could not write file to system: ${error.message}`);
		  })
		  .on("finish", () => {
		    console.log(`File downloaded to ${fileName}`);
		    resolve();
		  });

		downloadStream.pipe(fileWriterStream);
 	})
}


requestDribbblePage(querytype,1,2);

