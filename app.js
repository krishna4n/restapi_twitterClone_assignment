const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const format = require("date-fns/format");
let db = null;
const initiateDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB error ${e.message}`);
  }
};
initiateDBAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  getUser = `select * from user where username='${username}'`;
  const userExists = await db.get(getUser);
  if (userExists !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length > 6) {
      encryptedPassword = await bcrypt.hash(password, 10);
      registerQuery = `insert into user(username,password,name,gender) values('${username}','${encryptedPassword}','${name}','${gender}')`;
      await db.run(registerQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  getUser = `select * from user where username = '${username}'`;
  const userExists = await db.get(getUser);
  if (userExists === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userExists.password
    );
    if (isPasswordMatched) {
      const payload = {
        username: username,
        userId: userExists.user_id,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  getQuery =
    "select tweet,user from follower inner join user on follower.follower_user_id = user.user_id order by follower.follower_id desc limit 4";
  const data = await db.all(getQuery);
  const dataList = data.map((each) => ({
    username: each.username,
    tweet: each.tweet,
    dataTime: each.date_time,
  }));
  response.send(dataList);
});

const capitalizeString = (name) => {
  words = name.split(" ");
  let newWord = "";
  for (word of words) {
    newWord += word[0].toUpperCase() + word.slice(1, word.length) + " ";
  }
  return newWord.trim();
};

app.get("/user/following/", authenticateToken, async (request, response) => {
  getQuery = `select * from follower inner join user on follower.follower_user_id = user.user_id where follower.following_user_id ='${request.userId}'`;
  const data = await db.all(getQuery);
  const dataList = data.map((each) => ({
    name: capitalizeString(each.name),
  }));
  response.send(dataList);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  getQuery = `select * from follower inner join user on follower.follower_user_id = user.user_id where follower.following_user_id = '${request.userId}'`;
  const data = await db.all(getQuery);
  console.log(data);
  const dataList = data.map((each) => ({
    name: capitalizeString(each.name),
  }));
  response.send(dataList);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  getFollowerQuery = `select * from follower where follower_user_id='${request.userId}'`;

  isFollows = await db.get(getFollowerQuery);
  if (isFollows === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    getQuery = `select tweet,count(distinct reply_id) as replies,count(distinct like_id) as likes,date_time as dateTime  from tweet inner join like on tweet.tweet_id = like.tweet_id inner join reply on reply.tweet_id = tweet.tweet_id group by tweet.tweet_id having tweet.tweet_id =${tweetId}`;
    const data = await db.all(getQuery);
    response.send(data);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    getFollowingQuery = `select * from follower where following_user_id='${request.userId} and tweet_id ='${tweetId}'`;

    isFollows = await db.get(getFollowingQuery);
    if (isFollows === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      console.log("authenticated");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    getFollowingQuery = `select * from follower where following_user_id='${request.userId}' and tweet_id='${tweetId}'`;
    isFollows = await db.get(getFollowingQuery);
    if (isFollows === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      getQuery = `select user.name,reply from follower join reply on follower.following_user_id = reply.user_id join user on user.user_id = reply.user_id where reply.tweet_id='${tweetId}'`;
      console.log(getQuery);
      const data = await db.all(getQuery);
      const dataList = {
        replies: data,
      };
      response.send(dataList);
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  getQuery = `select tweet,count(distinct reply_id) as replies,count(distinct like_id) as likes,date_time as dateTime  from tweet join like on tweet.tweet_id = like.tweet_id join reply on reply.tweet_id = tweet.tweet_id group by tweet.tweet_id having tweet.user_id = '${request.userId}'`;
  console.log(getQuery);
  const data = await db.all(getQuery);
  response.send(data);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const user_id = request.userId;
  const convertedDate = format(new Date(), "yyyyy-MM-dd hh:mm:ss");
  const { tweet } = request.body;
  recordTweet = `insert into tweet(tweet,user_id,date_time) values('${tweet}','${user_id}','${convertedDate}')`;
  console.log(recordTweet);
  const saveRecord = await db.run(recordTweet);
  console.log(saveRecord);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    getUser = `select * from tweet where user_id='${request.userId}' and tweet_id='${tweetId}'`;
    console.log(getUser);
    const isOwnTweet = await db.get(getUser);
    console.log(isOwnTweet);
    if (isOwnTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      deleteQuery = `delete from tweet where tweet_id='${tweetId}'`;

      console.log(deleteQuery);
      const delStatus = await db.run(deleteQuery);
      console.log(delStatus);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
