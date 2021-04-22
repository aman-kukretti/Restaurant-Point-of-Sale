//jshint esversion:6

const express = require("express")
const bodyParser = require("body-parser")
const ejs = require("ejs")
const mongoose = require("mongoose")
const mysql = require("mysql2")
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

mongoose.connect("mongodb://localhost:27017/testDB", {useNewUrlParser: true, useUnifiedTopology: true});

var categorySchema = {
  _id: Number,
  categoryName: String
}

var itemSchema = {
  _id: Number,
  itemName: String,
  itemDescription: String,
  category_id: Number,
  itemPrice: Number,
  veg: Boolean
}

const Category = mongoose.model("Category", categorySchema);
const Item = mongoose.model("Item", itemSchema);

if(1) {
//   const category = new Category({
//     _id: 1,
//     categoryName: "Whopper"
//   })
//   const category2 = new Category({
//     _id: 2,
//     categoryName: "Sides"
//   })
//   category.save();
//   category2.save();
//   const item = new Item({
//     _id: 1,
//     itemName: "Veg Whopper",
//     itemDescription: "Our signature Whopper with 7 layers between the buns. Extra crunchy veg Patty, fresh onion, crispy lettuce, juicy tomatoes, tangy gherkins, creamy and smoky sauces with xxl buns. It?s Not A Burger, it?s a Whopper.",
//     category_id: 1,
//     itemPrice: 149,
//     veg: true
//   })
//   const item2 = new Item({
//     _id: 2,
//     itemName: "Chicken Whopper",
//     itemDescription: "Our signature Whopper with 7 layers between the buns. Flame Grilled chicken Patty, fresh onion, crispy lettuce, juicy tomatoes, tangy gherkins, creamy and smoky sauces with xxl buns. It?s Not A Burger, it?s a Whopper.",
//     category_id: 1,
//     itemPrice: 169,
//     veg: false
//   })
//   const item3 = new Item({
//     _id: 3,
//     itemName: "Mutton Whopper",
//     itemDescription: "Flame grilled signature Mutton patty Whopper",
//     category_id: 1,
//     itemPrice: 259,
//     veg: false
//   })
//   const item4 = new Item({
//     _id: 4,
//     itemName: "Cheesy Fries",
//     itemDescription: "Crispy french fries, loads of cheese, yum!",
//     category_id: 2,
//     itemPrice: 99,
//     veg: true
//   })
//   const item5 = new Item({
//     _id: 5,
//     itemName: "Peri Peri Fries",
//     itemDescription: "Crispy fries with peri peri spice. Hot indeed.",
//     category_id: 2,
//     itemPrice: 90,
//     veg: true
//   })
//   const item6 = new Item({
//     _id: 6,
//     itemName: "Chicken Fries",
//     itemDescription: "5 pieces of homemade chicken yumminess.",
//     category_id: 2,
//     itemPrice: 79,
//     veg: false
//   })
//   item.save();
//   item2.save();
//   item3.save();
//   item4.save();
//   item5.save();
//   item6.save();
}

app.get("/", function(req, res) {
  res.render("login");
})

app.get("/order", function(req, res) {

  Item.find({}, function(err, items) {
      if(err) {
        console.log(err);
      } else {
        Category.find({}, function(errc, categories) {
            if(err) {
              console.log(errc);
            } else {
              res.render("order", {
                itemList: items,
                categoryList: categories
              })
            }
        })
      }
  })
})

app.get("/ordersql", function(req, res) {
  const sqlQuery = "SELECT * from category";
  const sqlQuery2 = "SELECT * from item";
}

app.post("/login", function(req, res) {
  const userName = req.body.username;
  const dept = req.body.dept;
  const pwd = req.body.pwd;

  res.redirect("/order");
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
      console.log("Category fetched successfully!");
      res.render("itemForm", {categories: rows})
    }
  })
})

app.post("/newitem", upload.single('itemImage'), async function(req, res) {
  const result = await cloudinary.v2.uploader.upload(req.file.path)

  var sqlQuery = 'INSERT INTO item(name, description, price, cat_id, isVeg, imagePath) values("';
  sqlQuery += req.body.name + '", "';
  sqlQuery += req.body.description + '", "';
  sqlQuery += req.body.price + '", "';
  sqlQuery += req.body.category + '", "';
  sqlQuery += req.body.isVeg + '", "';
  sqlQuery += result.secure_url + '")';

  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
    else {
      console.log("Item created successfully!");
      console.log(response);
      res.redirect("/newitem")
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

function authenticate(name, dept, pwd) {

}
