import got from 'got';
import * as cheerio from 'cheerio';
import fs from 'fs';
import fetch from 'node-fetch'
import File from 'fetch-blob/file.js'
import { fileFromSync } from 'fetch-blob/from.js'
import { FormData } from 'formdata-polyfill/esm.min.js'

var [querytype,mode] = process.argv.slice(2);
if(!querytype)querytype="app";
if(!mode)mode="normal";

console.log("querytype:"+querytype);
console.log("mode:"+mode);

const imgcompress = 1;
const imgsize = "840x630";
const isDebug = false;

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
		postObj["shotid"]=shotId;
		postObj["author"]=author;

		var extraHtml = $(shotItem).children(".js-thumbnail-base").children(".shot-thumbnail-extras").html().trim();
		var hasExtra = extraHtml!="";
		console.log("hasExtra:"+hasExtra);

		if(hasExtra){
			const pics = await parseDetail(shotId);
			postObj["pics"]=pics;
		}

		var imghtml = $(shotItem).children(".js-thumbnail-base").children(".js-thumbnail-placeholder").children("noscript").html();

		var reg = /src=[\'\"]?([^\'\"]*)[\'\"]?/;

		if(reg.test(imghtml)){
			var img = RegExp.$1;

			img = img.substr(0,img.indexOf("?"));

			
			
			img = await uploadToUniCloud(img+"?compress="+imgcompress+"&resize="+imgsize,shotId+"_1.jpg",shotId);

			postObj["cover"]=img;
		}

		var hasVideo = $(shotItem).children(".js-thumbnail-base").hasClass("video");
		console.log("hasVideo:"+hasVideo);

		if(hasVideo){
			var videourl = $(shotItem).children(".js-thumbnail-base").attr("data-video-teaser-small");//small,medium,large
			videourl=await uploadToUniCloud(videourl,shotId+"_1.mp4",shotId);

			if(mode==="video")await download(videourl,shotId+"_1.mp4");

			postObj["video"]=videourl;
		}

		console.log(postObj);
		if(postObj["cover"])await postToUniCloud(postObj);
		else{
			console.log("有点问题，本条不提交！");
		}

		console.log("第"+(i+1)+"条数据处理结束");
	}

	if(page<total){
		requestDribbblePage(q,page+1,total);
	}
}
function getTimeoutSignal(){
	const controller = new AbortController();
	const signal = controller.signal;
	setTimeout(() => { 
		controller.abort()
	}, 60000);

	return signal;
}
async function postToUniCloud(obj){
	console.log("将数据提交至阿里云dribbble集合");
	var res 
	
	try{
		res = await fetch('https://e0b75de1-90c7-4c11-9d12-a8bc84c4d081.bspapp.com/dribbble', { 
			method: 'POST', 
			body: JSON.stringify({
				...obj,
				action:"add"
			}),
			signal:getTimeoutSignal()
		});
		var resData = await res.json();

		console.log(resData);
	}catch(err){}
}
async function uploadToUniCloud(filepath,filename,shotid){
	console.log(filepath,filename,shotid);
	if(isDebug){
		console.log("Debug 模式不执行上传");
		return filepath;
	}

	//step1. 上传至腾讯云云存储
	//https://ezshine-284162.service.tcloudbase.com/uploadfile
	console.log("step1. 上传至腾讯云云存储");
	
	var fd = new FormData();

	fd.append('action', "upload");

	var file;

	if(filepath.indexOf("http")==0){
		var fileData = await got(filepath).buffer();
		file = new File([fileData],filename);
	}else{
		file = fileFromSync(filepath);
	}
	fd.append('file', file);

	var res;
	var urlpath;
	var fileID;

	async function step1(){
		try{
			res = await fetch('https://ezshine-284162.service.tcloudbase.com/uploadfile', { 
				method: 'POST', 
				body: fd ,
				signal:getTimeoutSignal()
			});
			var resData = await res.json();

			urlpath = resData.fileList[0].download_url;
			fileID = resData.fileList[0].fileID;
			console.log(resData);
		}catch(err){
			console.log(err);
		}
	}
	try{
		await step1();
	}catch(err){
		await step1();
		return "";
	}
	
	//step2. 提交至阿里云云存储
	//https://e0b75de1-90c7-4c11-9d12-a8bc84c4d081.bspapp.com/dribbble
	console.log("step2. 提交至阿里云云存储");
	var fileurl;
	async function step2(){
		try{
			res = await fetch('https://e0b75de1-90c7-4c11-9d12-a8bc84c4d081.bspapp.com/dribbble', { 
				method: 'POST', 
				body: JSON.stringify({
					action:"transfer",
					shotid:shotid,
					filename:file.name,
					url:urlpath
				}),
				signal:getTimeoutSignal()
			});
			var resData = await res.json();
			console.log(resData);

			fileurl = resData.data;
		}catch(err){
			console.log(err);
		}
	}
	try{
		await step2();
	}catch(err){
		await step2();
		return "";
	}

	//step3. 删除腾讯云云存储
	console.log("step3. 从腾讯云云存储删除");
	var fd = new FormData();
	fd.append('action', "delete");
	fd.append('fileID', fileID);

	async function step3(){
		try{
			res = await fetch('https://ezshine-284162.service.tcloudbase.com/uploadfile', { 
				method: 'POST', 
				body: fd ,
				signal:getTimeoutSignal()
			});
			var resData = await res.json();

			console.log(resData);
		}catch(err){
			console.log(err);
		}
	}

	try{
		step3();
	}catch(err){
		step3();
	}

	return fileurl;
}
async function parseDetail(id){
	//https://dribbble.com/shots/17305604
	console.log("parseDetail:"+id);

	const res = await got("https://dribbble.com/shots/"+id).text();

	const $ = cheerio.load(res);

	const allShots = $(".media-slide");
	const length = allShots.length;

	var pics = [];

	for(let i = 1;i<length;i++){
		var shotItem = allShots[i];
		var picurl = $(shotItem).find("img").attr("data-animated-url");
		var filename = id+"_"+(i+1)+".jpg";
		
		if(picurl){
			picurl = await uploadToUniCloud(picurl+"?compress="+imgcompress+"&resize="+imgsize,filename,id);
			if(picurl)pics.push(picurl);
		}
	}

	return pics;
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


requestDribbblePage(querytype,1,3);

