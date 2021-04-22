//jshint esversion:6

const express = require("express")
const bodyParser = require("body-parser")
const ejs = require("ejs")
const mysql = require("mysql2")
const async = require("async")
require('dotenv').config()
const cloudinary = require('cloudinary')

require('./handlers/cloudinary')
const upload = require('./handlers/multer')

const app = express();

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({extended: true})).use(bodyParser.json());
app.use(express.static("public"));

const db = mysql.createConnection({
  host: 'localhost',
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: "testDB"
})

db.connect(function(err) {
  if(err) {
    console.log(err);
  } else {
    console.log("Connection to database successful");
  }
})

app.get("/", function(req, res) {
  res.render("login");
})

app.post("/login", function(req, res) {
  const userName = req.body.username;
  const dept = req.body.dept;
  const pwd = req.body.pwd;

  res.redirect("/order");
})

app.get("/order", function(req, res) {
  var data = [];
  const sqlQuery = "SELECT * from category";

  db.query(sqlQuery, function(err, catrows, response) {
    if(err) throw err;
    else {
      catrows.forEach(function(category) {
        const sqlQuery2 = "SELECT * from item WHERE id IN(SELECT item_id FROM belongsto WHERE cat_id=" + category.id + ")";
        db.query(sqlQuery2, function(err, itemRows, response) {
          if(err) throw err;
          else {
            data.push({
              category: category,
              items: itemRows
            })
          }
        })
      })
    }
  })
  setTimeout(() => {
    res.render("order", {rows: data});
  }, 1000);
})

app.post("/order", function(req, res) {
  res.send(req.body);
})

app.get("/cart", function(req, res) {
  res.render("cart");
})

app.get("/newitem", function(req, res) {
  const sqlQuery = "SELECT * FROM category";
  db.query(sqlQuery, function(err, rows, response) {
    if(err) throw err;
    else {
      res.render("itemForm", {categories: rows})
    }
  })
})

app.post("/newitem", upload.single('itemImage'), async function(req, res) {
  const result = await cloudinary.v2.uploader.upload(req.file.path)

  var sqlQuery = 'INSERT INTO item(name, description, price, isVeg, imagePath) values("';
  sqlQuery += req.body.name + '", "';
  sqlQuery += req.body.description + '", "';
  sqlQuery += req.body.price + '", "';
  sqlQuery += req.body.isVeg + '", "';
  sqlQuery += result.secure_url + '")';

  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
    else {
      console.log("Item created successfully!");
      const sqlQuery2 = 'INSERT INTO belongsto VALUES(' + response.insertId + ', ' + req.body.category + ')';
      db.query(sqlQuery2, function(err,response) {
        if(err) throw err;
        else {
          res.redirect("/newitem")
        }
      });
    }
  })

})

app.get("/newcategory", function(req, res) {
  res.render("categoryForm")
})

app.post("/newcategory", function(req, res) {
  const sqlQuery = 'INSERT INTO category(name) VALUES("' + req.body.name + '")';
  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
    else {
      console.log("Caegory created successfully!");
      console.log(response);
    }
  })
  res.redirect("/newcategory")
})

app.get("/createdb", function(req, res) {
  const sqlQuery = "CREATE DATABASE testDB";
  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
    else {
      res.send("Database created successfully!");
      console.log(response);
    }
  })
})

app.get("/createtableitem", function(req, res) {
  const sqlQuery = "CREATE TABLE item(id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(35) NOT NULL, description VARCHAR(300), price INT NOT NULL, cat_id INT NOT NULL, isVeg BOOL NOT NULL, imagePath VARCHAR(200))";

  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
    else {
      res.send("Items table created successfully!");
      console.log(response);
    }
  })
})

app.get("/createtablecategory", function(req, res) {
  const sqlQuery = "CREATE TABLE category(id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(35) NOT NULL)";

  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
    else {
      res.send("Categories Table created successfully!");
      console.log(response);
    }
  })
})

app.listen(3000, function() {
  console.log("Server is running on port 3000.");
})
