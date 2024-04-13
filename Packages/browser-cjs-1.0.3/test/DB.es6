class DB {
  connect(dsn) {
    return true;
  }

  query(obj) {
    return {};
  }
}

// There will only ever be one instance of the database class
module.exports = new DB();