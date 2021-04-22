const multer = require('multer')

module.exports = multer({
  storage: multer.diskStorage({}),
  fileFilter: (req,file,cb) => {
    if(!file.mimetype.match(/jpe|jpeg|png|jfif$i/)) {
      cb(new Error("File type not supported"), false)
      return
    }
    cb(null,true)
  }
})
