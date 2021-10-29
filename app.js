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

//setting up mysql db locally
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

var pos = 0; //if 0 indicates unauthenticated otherwise stores type of access
var empid = 0; //stores the id of the employee logged in currently

//render login page
//post to login, validate then redirect ti dashboard, if fails render login page with fail=1

app.route("/")
.get(function(req, res) {
  pos=0;
  empid=0;
  res.render("login", {fail:0});
})
.post(function(req, res) {
  pos=0;
  empid=0;
  const userName = req.body.user.toLowerCase();
  const pwd = req.body.pwd;
  const empQuery = `SELECT id,email,pos_id FROM employee WHERE password="${pwd}"`;
  db.query(empQuery, function(err, rows, response) {
    if(err) throw err;
    else {
      rows.forEach(function(row) {
        const name = row.email.toLowerCase();
        if(userName===name) {
          const query = `SELECT access from designation WHERE id=${row.pos_id}`;
          db.query(query, function(err, des, response) {
            if(err) throw err;
            else {
              pos = des[0].access;
              empid = row.id;
            }
          })
        }
      })
      setTimeout(()=>{
        if(pos===0) res.render("login", {fail:1});
        else {
          if(pos===3) res.redirect("/orders");
          else res.redirect("/dashboard");
        }
      },2000)
    }
  })
})

//render dashboard page passing the access the employee is to have
app.get("/dashboard", function(req, res) {
  if(pos==1 || pos==2) {
    res.render("dashboard", {pos: pos});
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})

//logout by setting both pos and empid to 0
app.get("/logout", function(req, res) {
  pos = 0;
  empid=0;
  res.redirect("/");
})

//get the items and categories and render ordering page
//insert into reqOrder the customer details etc
//insert into contains id of all items ordered
//then redirect to /order/(this orderid)/(today)
app.route("/order")
.get(function(req, res) {
  if(pos===1 || pos===2) {
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
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})
.post(function(req, res) {
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
        const sqlQuery3 = `INSERT INTO restOrder values(${id}, CURDATE(), CURTIME(), ${0}, ${empid}, ${req.body.tableno}, "${req.body.customerName}", "${req.body.customerPhone}")`;
        db.query(sqlQuery3, function(err, response) {
          if(err) throw err;
          else {
            const temp = (new Date()).toISOString();
            const requestedDate = temp.substr(0,4) + temp.substr(5,2) + temp.substr(8,2);
            res.redirect(`/order/${id}/${requestedDate}`);
          }
        })
      } else {
        res.redirect("/order");
      }
    }
  })
})

//get customers as well as all items related to this order
//mark status of the order as done i.e. true, then redirect to /orders
app.route("/order/:orderId/:orderDate")
.get(function(req, res) {
  if(pos===1 || pos===2 || pos===3) {
    const requestedID = parseInt(req.params.orderId);
    const temp = req.params.orderDate;
    const requestedDate = temp.substr(0,4) + '-' + temp.substr(4,2) + '-' + temp.substr(6);
    const orderQuery = `SELECT name,item_quantity as quantity,price FROM (SELECT itemid,item_quantity FROM contains WHERE orderdate="${requestedDate}" and orderid=${requestedID})tblTmpc INNER JOIN (SELECT id,name,price FROM item)tblTemp ON itemid=id`;
    db.query(orderQuery, function(err, rows, response) {
      if(err) throw err;
      else {
        var amount = 0;
        for(var i=0; i<rows.length; i++) {
          amount += rows[i].quantity * rows[i].price;
        }
        const gstAmount = Math.round(amount*0.08);
        const topay = amount + gstAmount;
        const customerQuery = `SELECT tbl1.id as id,tbl2.name as empname,empid,status,custname as name,DATE_FORMAT(reqdate, "%Y-%m-%d") as statusDate,DATE_FORMAT(reqdate, "%d %b %Y") as date,DATE_FORMAT(reqtime, "%r") as time FROM (SELECT * FROM restOrder WHERE reqdate="${requestedDate}" AND id=${requestedID})tbl1 INNER JOIN (SELECT id,name FROM employee)tbl2 ON empid=tbl2.id`;
        db.query(customerQuery, function(err, customer, response) {
          if(err) throw err;
          else {
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
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})
.post(function(req, res) {
  const requestedID = req.params.orderId;
  const temp = req.params.orderDate;
  const requestedDate = temp.substr(0,4) + '-' + temp.substr(4,2) + '-' + temp.substr(6);
  const statusMarkQuery = `UPDATE restOrder SET status=1 where id=${requestedID} AND reqdate="${requestedDate}"`;
  db.query(statusMarkQuery, function(err,response) {
    if(err) throw err;
    else {
      res.redirect("/orders");
    }
  })
})

//get all orders of today with status=true
//get all orders of mentioned date with mentioned status, render orderlist
app.route("/orders")
.get(function(req, res) {
  if(pos===1 || pos===2 || pos===3) {
    const today = (new Date()).toISOString().substr(0,10);
    const orderQuery = `SELECT id,tableno,DATE_FORMAT(reqtime, "%r") as time,custname,status,empid from restOrder WHERE reqdate="${today}" and status=0`;
    db.query(orderQuery, function(err,rows,response) {
      if(err) throw err;
      else res.render("orderList", {pos: pos, orders: rows, date:today, state:"on"})
    })
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})
.post(function(req, res) {
  const date = req.body.date;
  let getOrders = ``;
  if(req.body.state === "on") {
    getOrders = `SELECT id,tableno,DATE_FORMAT(reqtime, "%r") as time,custname,status,empid FROM restOrder WHERE reqdate="${date}" AND status=0`;
  } else {
    getOrders = `SELECT id,tableno,DATE_FORMAT(reqtime, "%r") as time,custname,status,empid FROM restOrder WHERE reqdate="${date}"`;
  }
  db.query(getOrders, function(err, rows, response) {
    if(err) throw err;
    else {
      res.render("orderList", {pos: pos, orders: rows, date: date, state: req.body.state});
    }
  })
})

//render menu page by getting items as well as categories
app.get("/menu", function(req, res) {
  if(pos===1) {
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
      res.render("viewMenu", {rows: data});
    }, 1000);
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})

//render newitem page
//insert values posted into item and belongsTo and upload image to cloudinary by using multer, then redirect to /menu
app.route("/newitem")
.get(function(req, res) {
  if(pos===1) {
    const sqlQuery = "SELECT * FROM category";
    db.query(sqlQuery, function(err, rows, response) {
      if(err) throw err;
      else {
        res.render("itemForm", {categories: rows})
      }
    })
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})
.post(upload.single('itemImage'), async function(req, res) {
  var sqlQuery = "";
  if(req.file === undefined) {
    sqlQuery = `INSERT INTO item(name, description, price, isVeg) values("${req.body.name}","${req.body.description}",${req.body.price},${req.body.isVeg})`;
  } else {
    const result = await cloudinary.v2.uploader.upload(req.file.path);
    sqlQuery = `INSERT INTO item(name, description, price, isVeg, imageVersion, image_public_id, imageFormat) values("${req.body.name}","${req.body.description}",${req.body.price},${req.body.isVeg},"${result.version}","${result.public_id}","${result.format}")`;
  }

  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
    else {
      const sqlQuery2 = `INSERT INTO belongsto VALUES(${response.insertId},${req.body.category})`;
      db.query(sqlQuery2, function(err2,response2) {
        if(err2) throw err2;
        else {
          res.redirect("/menu")
        }
      });
    }
  })

})

//render edit page by getting current instance of the item
//update values to item, update image if there at cloudinary, redirect to /menu
app.route("/item/edit/:itemID/:publicID")
.get(function(req, res) {
  if(pos===1) {
    const itemID = parseInt(req.params.itemID);
    const public_id = req.params.publicID;
    const itemQuery = `SELECT * from item INNER JOIN belongsto ON id=item_id WHERE id=${itemID}`;
    db.query(itemQuery, function(err, rows, response) {
      if(err) throw err;
      else {
        const sqlQuery = "SELECT * FROM category";
        db.query(sqlQuery, function(err, catrows, response) {
          if(err) throw err;
          else {
            res.render("itemEdit", {item: rows[0], categories: catrows})
          }
        })
      }
    })
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})
.post(upload.single('itemImage'), async function(req, res) {
  const itemID = parseInt(req.params.itemID);
  const public_id = req.params.publicID;
  var updateQuery = `UPDATE item SET name="${req.body.name}", description="${req.body.description}", price=${req.body.price}, isVeg=${req.body.isVeg}`;
  if(req.file === undefined) {

  } else if(public_id==="null") {
    //upload image
    const result = await cloudinary.v2.uploader.upload(req.file.path);
    updateQuery += `, imageVersion="${result.version}", image_public_id="${result.public_id}", imageFormat="${result.format}"`;
  } else {
    //delete previous image, upload image with the same public id
    const deleteResult = await cloudinary.v2.uploader.destroy(public_id);
    const result = await cloudinary.v2.uploader.upload(req.file.path);
    updateQuery += `, imageVersion="${result.version}", image_public_id="${result.public_id}", imageFormat="${result.format}"`;
  }
  updateQuery += ` WHERE id=${itemID}`;
  db.query(updateQuery, function(err, response) {
    if(err) throw err;
    else {
      const updateQuery2 = `UPDATE belongsto SET cat_id=${req.body.category} WHERE item_id=${itemID}`;
      db.query(updateQuery2, function(err, response) {
        if(err) throw err;
        else {
          res.redirect("/menu");
        }
      })
    }
  })
})

//delete item from db and delete image from cloudinary, redirect to /menu
app.get("/item/delete/:itemID/:publicID", async function(req, res) {
  if(pos===1) {
    const itemID = parseInt(req.params.itemID);
    const public_id = req.params.publicID;
    if(public_id!="null") {
      result = await cloudinary.v2.uploader.destroy(public_id);
    }
    const deleteQuery = `DELETE FROM item WHERE id=${itemID}`;
    db.query(deleteQuery, function(err, response) {
      if(err) throw err;
      else {
        const deleteQuery2 = `DELETE FROM belongsto WHERE item_id=${itemID}`;
        db.query(deleteQuery2, function(err, response) {
          if(err) throw err;
          else {
            res.redirect("/menu");
          }
        })
      }
    })
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})

//render new category form
//insert into category then redirect to /menu
app.route("/newcategory")
.get(function(req, res) {
  if(pos===1) {
    res.render("categoryForm")
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})
.post(function(req, res) {
  const sqlQuery = `INSERT INTO category(name) VALUES("${req.body.name}")`;
  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
  })
  res.redirect("/menu")
})

//render employee form
//insert into employee, redirect to /employees
app.route("/newemployee")
.get(function(req, res) {
  if(pos===1) {
    const positionsQuery = "SELECT * FROM designation";
    db.query(positionsQuery, function(err, rows, response) {
      if(err) throw err;
      else {
        res.render("employeeForm", {positions: rows})
      }
    })
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})
.post(function(req, res) {
  const insertQuery = `INSERT INTO employee(name,pos_id,dob,password,contact,email) values("${req.body.name}",${req.body.position},"${req.body.dob}","${req.body.pass}","${req.body.contact}","${req.body.email}")`;
  db.query(insertQuery, function(err,response) {
    if(err) throw err;
    else {
      res.redirect("/employees");
    }
  })
})

//get details of employee from db, render employeeView
app.get("/employee/view/:empID", function(req, res) {
  if(pos===1) {
    const empID = parseInt(req.params.empID);
    const empQuery = `SELECT * FROM employee WHERE id=${empID}`;
    db.query(empQuery, function(err, rows, response) {
      if(err) throw err;
      else {
        const posQuery = `SELECT * FROM designation WHERE id=${rows[0].pos_id}`;
        db.query(posQuery, function(err, posrows, response) {
          if(err) throw err;
          else {
            res.render("employeeView", {employee:rows[0], position:posrows[0]})
          }
        })
      }
    })
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})

//get details of employee from db, render empEdit
//update details of employee in db, redirect to /employees
app.route("/employee/edit/:empID")
.get(function(req, res) {
  if(pos===1) {
    const empID = parseInt(req.params.empID);
    const empQuery = `SELECT * FROM employee WHERE id=${empID}`;
    db.query(empQuery, function(err, rows, response) {
      if(err) throw err;
      else {
        const positionQuery = "SELECT * FROM designation";
        db.query(positionQuery, function(err, posrows, response) {
          if(err) throw err;
          else {
            res.render("empEdit", {positions: posrows, employee:rows[0]})
          }
        })
      }
    })
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})
.post(function(req, res) {
  const empID = parseInt(req.params.empID);
  const emp = req.body;
  const updateQuery = `UPDATE employee SET name="${emp.name}",pos_id=${emp.position},contact="${emp.contact}",email="${emp.email}",password="${emp.pass}" WHERE id=${empID}`;
  db.query(updateQuery, function(err, rows, response) {
    if(err) throw err;
    else res.redirect("/employees");
  })
})

//delete record of employee in db, redirect to /employees
app.get("/employee/delete/:empID", function(req, res) {
  if(pos===1) {
    const empID = parseInt(req.params.empID);
    const emp = req.body;
    const deleteQuery = `DELETE FROM employee WHERE id=${empID}`;
    db.query(deleteQuery, function(err, rows, response) {
      if(err) throw err;
      else res.redirect("/employees");
    })
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})

//render position form
//insert into designation, then redirect to /employees
app.route("/newposition")
app.get(function(req, res) {
  if(pos===1) {
    res.render("positionForm")
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})
app.post(function(req, res) {
  const sqlQuery = `INSERT INTO designation(name,salary,access) VALUES("${req.body.name}",${req.body.salary},${req.body.access})`;
  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
  })
  res.redirect("/employees")
})

//get positions from designation table in db, render posEdit
//update position selected in designation table in db, redirect to /employees
app.route("/position/edit")
app.get(function(req, res) {
  if(pos===1) {
    const empID = parseInt(req.params.empID);
    const positionQuery = "SELECT * FROM designation";
    db.query(positionQuery, function(err, posrows, response) {
      if(err) throw err;
      else {
        res.render("posEdit", {positions: posrows})
      }
    })
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})
app.post(function(req, res) {
  const editQuery = `UPDATE designation SET name="${req.body.name}",salary=${req.body.salary},access=${req.body.access} WHERE id=${req.body.position}`;
  db.query(editQuery, function(err, posrows, response) {
    if(err) throw err;
    else {
      res.redirect("/employees")
    }
  })
})

//inner join employee and designation tables, render employeeList
app.get("/employees", function(req, res) {
  if(pos==1) {
    const employeeQuery = `SELECT employee.id as id,employee.name as name,tbl.name as posname,contact FROM employee INNER JOIN (select id,name from designation)tbl ON pos_id=tbl.id`;
    db.query(employeeQuery, function(err,rows,response) {
      if(err) throw err;
      else {
        res.render("employeeList", {employees:rows})
      }
    })
} else {
  pos=0;
  empid=0;
  res.render("login", {fail:1});
}
})

//listen on listed port
app.listen(process.env.PORT || 3000, function() {
  console.log("Server is running on port 3000.");
})
