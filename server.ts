import express, { Request, Response, NextFunction } from "express";
import { join as pathJoin } from "path";
import search from "./lib/search";
import ytdl, { getInfo, MoreVideoDetails, filterFormats } from "ytdl-core";
import axios from "axios";
import Ffmpeg from "fluent-ffmpeg";

//Constants
const app = express();
const ROOT = pathJoin(__dirname, "public", "html");
const PORT = 8000;

//SetUp
app.set("view engine", "ejs");
app.set("views", ROOT);
app.use(express.static(pathJoin(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//Middleware
app.get("/", (req, res) => {
    res.render("index");
});

app.get("/docs", (req, res) => {
    res.render("docs");
});

app.get("/result", async (req, res) => {
    const { url } = req.query;
    let result = await search(<string>url);
    if (!url) return res.status(400).render("result404", { title: "Missing Url", message: "How sad, it's a Bad Request. Try it again, but this time make sure to search a real url X3" });
    if (!validateUrl(<string>url)) return res.status(400).render("result404", { title: "Not Valid URL", message: "Mhh it's not a Youtube URL >:3" });
    if (!result?.results?.length || result.results[0].link.match(/\/channel\//)) return res.status(404).render("result404");

    let current = result.results[0];
    let thumb = await axios.get(<string>current.thumbnails.high?.url, { responseType: "arraybuffer" }).catch(() => ({ data: "" }));
    let thumb64 = `data:image/jpg;base64,${Buffer.from(thumb.data).toString("base64")}`;
    res.render("results", { 
    title: current.title, 
    link: current.link,
    videoId: current.id, 
    description: current.description, 
    author: current.channelTitle, releaseDate: new Date(current.publishedAt).toDateString(), 
    thumb: thumb64, 
    authorId: current.channelId });
});

app.post("/downloadVideo", checkPayload2, async (req, res) => {
    const { quality } = req.body;
    res.set("Content-Type", "video/mp4");
    res.attachment(`${req.videoDetails.title.trim()}.mp4`);
    let video = ytdl(req.videoDetails.video_url, { quality, filter: "videoandaudio" }).pipe(res, { end: true });
});


app.post("/download", checkPayload, async (req, res) => {
    const { quality } = req.body;
    res.set("Content-Type", "audio/mpeg");
    res.attachment(`${req.videoDetails.title.trim()}.mp3`);
    let video = ytdl(req.videoDetails.video_url, { quality, filter: "audioonly" });
    
    let ffmpeg = Ffmpeg(video);
    ffmpeg
        .audioBitrate(quality === "highestaudio" ? "320" : "128")
        .format("mp3")
        .addOptions("-metadata", `title=${req.videoDetails.title}`, "-metadata", `artist=${req.videoDetails.author.name}`, "-metadata", `picture\ mime\ type=image/jpg`)
          .on("error", (err: any) => {
          console.log(err);
        })
        .pipe(res, { end: true });
});

//! Fallback Middleware
app.use((req, res) => {
    res.status(404).render("404");
});

//Run
    app.listen(PORT, () => {
        console.log("App is on port : " + PORT);
    });

//Custom Middleware
async function checkPayload(req: Request, res: Response, next: NextFunction) {
    const { payload, quality } = req.body;
    if (!payload || !quality) return res.status(400).json({ message: "Bad Request" });
    if (!validateUrl(payload)) return res.status(400).json({ message: "Invalid Url" });

    let info = await getInfo(payload);
    filterFormats(info.formats, "audioonly");
    if (!info?.videoDetails) return res.status(404).json({ message: "Video Detail Not Found" });
    req["videoDetails"] = info.videoDetails;
    return next();
}


//Custom Middleware
async function checkPayload2(req: Request, res: Response, next: NextFunction) {
    const { payload, quality } = req.body;
    if (!payload || !quality) return res.status(400).json({ message: "Bad Request" });
    if (!validateUrl(payload)) return res.status(400).json({ message: "Invalid Url" });

    let info = await getInfo(payload);
    filterFormats(info.formats, "videoandaudio");
    if (!info?.videoDetails) return res.status(404).json({ message: "Video Detail Not Found" });
    req["videoDetails"] = info.videoDetails;
    return next();
}

//Helper
function validateUrl(url: string): boolean {
    return !!url.match(/https?:\/\/(www.)?((youtube\.com\/watch\?.*v=.+)|(youtu\.be\/.+))/);
}

declare global {
    namespace Express {
        interface Request {
            [key: string]: any;
            videoDetails: MoreVideoDetails;
        }
    }
}
