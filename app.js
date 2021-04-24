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
app.use(express.static(__dirname + "/public"));

const db = mysql.createConnection({
  host: 'localhost',
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME
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
  var data = [];
  var keys = Object.keys(req.body);
  var values = Object.values(req.body);

  for(var i=0; i<keys.length; i++) {
    if(keys[i].includes("item")) {
      var quantity = values[i];
      var itemId = keys[i].substr(4);
      if(quantity!='0') {
        const namepriceQuery = `SELECT id,${parseInt(quantity)} as quantity,name,price FROM item WHERE id=${parseInt(itemId)}`;
        db.query(namepriceQuery, function(err, rows, response) {
          if(err) throw err;
          else {
            data.push({itemid: rows[0].id, quantity: rows[0].quantity, name: rows[0].name, price: rows[0].price});
          }
        })
      }
    }
  }

  var id = 0;
  const sqlQuery = "SELECT COUNT(*)+1 as lastid FROM restOrder WHERE reqdate=CURDATE()";
  db.query(sqlQuery, function(err, rows, response) {
    if(err) throw err;
    else {
      id = rows[0].lastid;
      if(data.length>0) {
        for(var i=0; i<data.length; i++) {
          const sqlQuery2 = `INSERT INTO contains VALUES(${id}, CURDATE(), ${data[i].itemid}, ${data[i].quantity})`;
          db.query(sqlQuery2, function(err, response) {
            if(err) throw err;
          })
        }
        const sqlQuery3 = `INSERT INTO restOrder values(${id}, CURDATE(), CURTIME(), ${0}, ${1}, ${req.body.tableno}, "${req.body.customerName}", "${req.body.customerPhone}")`;
        db.query(sqlQuery3, function(err, response) {
          if(err) throw err;
          else {
            // res.render("cart", {items: data});
            res.redirect(`/orders/today/${id}`);
          }
        })
      } else {
        res.redirect("/order");
      }
    }
  })
})

app.get("/orders/today/:orderId", function(req, res) {
  const requestedid = parseInt(req.params.orderId);
  const orderQuery = `SELECT name,item_quantity as quantity,price FROM (SELECT itemid,item_quantity FROM contains WHERE orderdate=CURDATE() and orderid=${requestedid})tblTmpc INNER JOIN (SELECT id,name,price FROM item)tblTemp ON itemid=id`;
  db.query(orderQuery, function(err, rows, response) {
    if(err) throw err;
    else {
      var amount = 0;
      for(var i=0; i<rows.length; i++) {
        amount += rows[i].quantity * rows[i].price;
      }
      const gstAmount = Math.round(amount*0.08);
      const topay = amount + gstAmount;
      const customerQuery = `SELECT id,custname as name,DATE_FORMAT(reqdate, "%d %b %Y") as date,HOUR(reqtime) as hour, MINUTE(reqtime) as minute FROM restOrder WHERE id=${requestedid}`
      db.query(customerQuery, function(err, customer, response) {
        if(err) throw err;
        else {
          console.log(typeof customer[0].date);
          res.render("cart", {
            items: rows,
            total: amount,
            gst: gstAmount,
            topay: topay,
            customer: customer[0]
          })
        }
      })

    }
  })
})

app.get("/orders/current", function(req, res) {
  res.render("orderList");
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
      const sqlQuery2 = 'INSERT INTO belongsto VALUES(' + response.insertId + ', ' + req.body.category + ')';
      db.query(sqlQuery2, function(err2,response2) {
        if(err2) throw err2;
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
  })
  res.redirect("/newcategory")
})

app.listen(3000, function() {
  console.log("Server is running on port 3000.");
})
