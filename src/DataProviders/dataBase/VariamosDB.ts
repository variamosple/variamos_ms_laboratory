import { Pool } from "pg";
import { Config } from "../../Config";

export const pool = new Pool({
  user: Config.DB.USER,
  host: Config.DB.HOST, 
  password: Config.DB.PASSWORD,
  database: Config.DB.DATABASE,
  port: Number(Config.DB.PORT) ,
  ssl: false,
});
