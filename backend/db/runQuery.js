// backend/db/runQuery.js
import connection from "./connectToDB.js";

function executeQuery(sql, values = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, values, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

export default executeQuery;