import { Sequelize } from "sequelize";
import { Config } from "../../Config";

const sequelizeVariamos = new Sequelize(
  Config.DB.DATABASE,
  Config.DB.USER,
  Config.DB.PASSWORD,
  {
    host: Config.DB.HOST,
    port: Number(Config.DB.PORT),
    dialect: "postgres",
    logging: false,

    pool: {
      max: 5,
      min: 0,
      idle: 10000,
    },

    dialectOptions: {
      // DB_SSL was read but never used: the connection was never encrypted
      ssl: Config.DB.SSL ? { require: true, rejectUnauthorized: false } : false,
    },

    define: {
      timestamps: true,
    },
  }
);

export default sequelizeVariamos;