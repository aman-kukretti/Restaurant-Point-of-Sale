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

var pos = 0;
var empid = 0;

app.get("/", function(req, res) {
  pos=0;
  empid=0;
  res.render("login", {fail:0});
})

app.post("/", function(req, res) {
  pos=0;
  empid=0;
  const userName = req.body.user.toLowerCase();
  const pwd = req.body.pwd;

  const empQuery = `SELECT id,name,pos_id FROM employee WHERE password="${pwd}"`;
  db.query(empQuery, function(err, rows, response) {
    if(err) throw err;
    else {
      rows.forEach(function(row) {
        const name = row.name.replace(/ /g,"").toLowerCase() + row.id;
        if(userName===name) {
          const query = `SELECT access from designation WHERE id=${row.pos_id}`;
          db.query(query, function(err, des, response) {
            if(err) throw err;
            else {
              pos = parseInt(des[0].access);
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

app.get("/dashboard", function(req, res) {
  if(pos==1 || pos==2) {
    res.render("dashboard", {pos: pos});
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})

app.get("/logout", function(req, res) {
  pos = 0;
  empid=0;
  res.redirect("/");
})

app.get("/order", function(req, res) {
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

app.get("/order/:orderId/:orderDate", function(req, res) {
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

app.post("/order/:orderId/:orderDate", function(req, res) {
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

app.get("/orders", function(req, res) {
  if(pos===1 || pos===2 || pos===3) {
    res.render("orderList", {pos: pos, orders: [], date:(new Date()).toISOString().substr(0,10)});
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})

app.post("/orders", function(req, res) {
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
      res.render("orderList", {pos:pos, orders: rows, date: date});
    }
  })
})

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

app.get("/newitem", function(req, res) {
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

app.post("/newitem", upload.single('itemImage'), async function(req, res) {
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
          res.redirect("/dashboard")
        }
      });
    }
  })

})

app.get("/item/edit/:itemID/:publicID", function(req, res) {
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

app.post("/item/edit/:itemID/:publicID", upload.single('itemImage'), async function(req, res) {
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

app.get("/newcategory", function(req, res) {
  if(pos===1) {
    res.render("categoryForm")
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})

app.post("/newcategory", function(req, res) {
  const sqlQuery = `INSERT INTO category(name) VALUES("${req.body.name}")`;
  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
  })
  res.redirect("/dashboard")
})

app.get("/newemployee", function(req, res) {
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

app.post("/newemployee", function(req, res) {
  const insertQuery = `INSERT INTO employee(name,pos_id,dob,password,contact,email) values("${req.body.name}",${req.body.position},"${req.body.dob}","${req.body.pass}","${req.body.contact}","${req.body.email}")`;
  db.query(insertQuery, function(err,response) {
    if(err) throw err;
    else {
      res.redirect("/dashboard");
    }
  })
})

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

app.get("/employee/edit/:empID", function(req, res) {
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

app.post("/employee/edit/:empID", function(req, res) {
  const empID = parseInt(req.params.empID);
  const emp = req.body;
  const updateQuery = `UPDATE employee SET name="${emp.name}",pos_id=${emp.position},contact="${emp.contact}",email="${emp.email}",password="${emp.pass}" WHERE id=${empID}`;
  db.query(updateQuery, function(err, rows, response) {
    if(err) throw err;
    else res.redirect("/employees");
  })
})

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

app.get("/newposition", function(req, res) {
  if(pos===1) {
    res.render("positionForm")
  } else {
    pos=0;
    empid=0;
    res.render("login", {fail:1});
  }
})

app.post("/newposition", function(req, res) {
  const sqlQuery = `INSERT INTO designation(name,salary,access) VALUES("${req.body.name}",${req.body.salary},${req.body.access})`;
  db.query(sqlQuery, function(err,response) {
    if(err) throw err;
  })
  res.redirect("/dashboard")
})

app.get("/position/edit", function(req, res) {
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

app.post("/position/edit", function(req, res) {
  const editQuery = `UPDATE designation SET name="${req.body.name}",salary=${req.body.salary},access=${req.body.access} WHERE id=${req.body.position}`;
  db.query(editQuery, function(err, posrows, response) {
    if(err) throw err;
    else {
      res.redirect("/employees")
    }
  })
})

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

app.listen(process.env.PORT || 3000, function() {
  console.log("Server is running on port 3000.");
})
