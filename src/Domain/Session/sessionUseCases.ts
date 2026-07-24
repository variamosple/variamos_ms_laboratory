import { json, Request, Response } from "express";
import { QueryResult } from "pg";
import Ajv from "ajv";
import { pool } from "../../DataProviders/dataBase/VariamosDB";
import { RequestAPI, RequestApiSchema } from "../Init/entities/request";
import {
  ResponseAPIError,
  ResponseAPISuccess,
} from "../Init/entities/response";
import { SessionDao } from "./SessionDao";
import { User } from "./Entities/User";


const ajv = new Ajv();

export default class SessionManagement {

  signIn = async (req: Request, res: Response) => {
    let transactionId = "signIn";
    try {
      let data = req.body;
      let sessionDao = new SessionDao();

      let user: User;
      let users = (await sessionDao.SelectUserByEmail(data.email))[0];
      if (users.length > 0) {
        user = new User("", "", "", "");
        user = Object.assign(user, users[0]);
      } else {
        let id=this.generateUUID();
        user = new User(id, data.name, data.name, data.email)
        await sessionDao.CreateUser(user);
      }

      let permissions = (await sessionDao.SelectPermissionsByUser(user.id))[0];

      let session = {
        user: {
          id: user.id,
          name: user.name
        },
        permissions: permissions
      }

      const responseApi = new ResponseAPISuccess();
      responseApi.message = "User authenticated.";
      responseApi.data = JSON.parse(JSON.stringify(session));
      responseApi.transactionId = transactionId;

      return res.status(200).json(responseApi);
    } catch (e) {
      const responseApi = new ResponseAPIError();
      responseApi.message = "Internal Server Error";
      responseApi.errorCode = "01";
      responseApi.data = JSON.parse(
        JSON.stringify('{"messageError": "' + e + '"}')
      );
      responseApi.transactionId = transactionId;
      console.log(JSON.stringify(responseApi));
      return res.status(500).json(responseApi);
    }
  };

  generateUUID() { // Public Domain/MIT
    var d = new Date().getTime();//Timestamp
    var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now() * 1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16;//random number between 0 and 16
      if (d > 0) {//Use timestamp until depleted
        r = (d + r) % 16 | 0;
        d = Math.floor(d / 16);
      } else {//Use microseconds since page-load if supported
        r = (d2 + r) % 16 | 0;
        d2 = Math.floor(d2 / 16);
      }
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
}
