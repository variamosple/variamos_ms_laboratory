import { Sequelize } from "sequelize";
import { Config } from "../../Config";

const sequelizeVariamos = new Sequelize(
  Config.DB.DATABASE,
  Config.DB.USER,
  Config.DB.PASSWORD,
  {
    host: Config.DB.HOST,
    port: Number(Config.DB.PORT), // <-- il manque
    dialect: "postgres",

    pool: {
      max: 5,
      min: 0,
      idle: 10000,
    },

    dialectOptions: {
      ssl: false,
    },

    define: {
      timestamps: true,
    },
  }
);

export default sequelizeVariamos;