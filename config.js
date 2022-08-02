require('dotenv').config();

module.exports = {
    "mySQL":{
        "host":process.env.HOST,
        "username":process.env.USER,
        "password":process.env.PASSWORD,
        "port":process.env.PORT,
        "database":process.env.DATABASE
    },
    "s3":{
        "Bucket": process.env.S3_BUCKET_NAME,
        "Region": process.env.REGION,
        "BasePathWithFilePrefix": process.env.S3_BASE_PATH_WITH_FILE_PREFIX
    }
}