'use strict';

class ApiResponse {
  constructor(message, data = undefined, meta = undefined) {
    this.success = true;
    this.message = message;

    if (data !== undefined) {
      this.data = data;
    }

    if (meta !== undefined) {
      this.meta = meta;
    }
  }
}

module.exports = ApiResponse;

