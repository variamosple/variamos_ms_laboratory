const dotenv = require('dotenv');
const path = require('path');
 
let envPath= "DEVELOPMENT" === process.env.NODE_ENV?.toUpperCase() ? './.env.development' : './.env';
console.log(envPath);

dotenv.config({
  path: envPath
});
 
export const Config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    HOST: process.env.HOST || '127.0.0.1',
    PORT: process.env.PORT || 4000,
    VERSION: "1.24.04.14.14",
    DB: {
      USER: process.env.DB_USER || "db_user_test",
      HOST: process.env.DB_HOST || "db_host_test",
      PASSWORD: process.env.DB_PASSWORD || "db_password_test",
      DATABASE: process.env.DB_DATABASE || "db_database_test",
      PORT: process.env.DB_PORT || 5433,
      SSL: process.env.DB_SSL || true
    }
}