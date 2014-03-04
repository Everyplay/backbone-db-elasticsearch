var _ = require('lodash');
var debug = require('debug')('backbone-db-elasticsearch');
var Db = require('backbone-db');

function ElasticSearchDb(name, client) {
  if (!client) {
    throw new Error('ElasticSearch client must be provided');
  }
  this.name = name || '';
  this.client = client;
  this.prefixSeparator = '::';
}

ElasticSearchDb.sync = Db.sync;

var convertResults = function(hits) {
  if (!hits || !hits.length) return [];
  return _.map(hits, function(hit) {
    debug('convert', hit);
    var doc = {};
    // prefix ids with type because otherwise collection may have colliding ids
    doc.id = hit._type + '::' + hit._id;
    doc.content = hit._source || {};
    // add information on content type
    doc.content_type = hit._type;
    doc.score = hit._score;
    return doc;
  });
};

var convertMsearchResults = function(responses) {
  if (!responses || !responses.length) return [];
  var results = [];
  _.each(responses, function(resp) {
    var hits = convertResults(resp.hits.hits);
    results = results.concat(hits);
  });
  return results;
};

_.extend(ElasticSearchDb.prototype, Db.prototype, {
  create: function(model, options, callback) {
    var self = this;
    var searchObject = this.getESOptions(model, {
      includeBody: true
    });
    debug('create', searchObject);
    this.client.create(searchObject, function(error, resp) {
      if (options.wait === true) {
        debug('refresh indices');
        self._refreshIndices(null, function(err, res) {
          callback(error, model.toJSON());
        });
      } else {
        callback(error, model.toJSON());
      }
    });
  },

  find: function(model, options, callback) {
    this.client.get(this.getESOptions(model), function(error, resp) {
      if (error) return callback(error);
      model.set(resp._source);
      callback(error, model.toJSON());
    });
  },

  findAll: function(collection, options, callback) {
    if (options.msearch) {
      return this.msearch(collection, options, callback);
    } else {
      return this.search(collection, options, callback);
    }
  },

  update: function(model, options, callback) {
    options = options || {};
    if (!options.update) return this.create.apply(this, arguments);
    this.client.update(this.getESOptions(model, {
      includeBody: true,
      update: true
    }), function(error, resp) {
      callback(error, model.toJSON());
    });
  },

  destroy: function(model, options, callback) {
    var searchObject = this.getESOptions(model);
    debug('destroy', searchObject);
    this.client.delete(searchObject, function(error, resp) {
      callback(error, model.toJSON());
    });
  },

  // Private methods:
  _refreshIndices: function(indexes, callback) {
    if (!indexes) indexes = '_all';
    this.client.indices.refresh({
      index: indexes
    }, function(err, response) {
      callback(err);
    });
  },

  search: function(collection, options, callback) {
    var query = {
      body: {
        query: options.query
      }
    };
    if (options.index) {
      query.indexes = this.prefixIndexKeys(options.index);
    }
    if (options.type) query.type = options.type;

    if (options.offset || options.from) {
      query.body.from = options.offset || options.from || 0;
    }
    if (options.limit || options.size) {
      query.body.size = options.limit || options.size || 0;
    }
    if (options.filter) query.body.filter = options.filter;
    if (options.indicesBoost) {
      query.body.indicesBoost = this.prefixObjectIndexKeys(options.indicesBoost);
    }
    if (options.sort) query.body.sort = options.sort;

    debug('findAll query', JSON.stringify(query));
    this.client.search(query, function(error, resp) {
      if (error) return callback(error);
      debug('findAll results', JSON.stringify(resp));
      callback(null, convertResults(resp.hits.hits));
    });
  },

  msearch: function(collection, options, callback) {
    var query = {
      body: this.prefixMqueryOptions(options.body)
    };
    debug('mquery:', query);
    this.client.msearch(query, function(error, resp) {
      if (error) return callback(error);
      var responseErrors = _.filter(resp.responses, function(response) {
        return response.error;
      });
      if (responseErrors.length) {
        var msg = _.pluck(responseErrors, 'error').join(' & ');
        return callback(new Error(msg));
      }
      callback(null, convertMsearchResults(resp.responses));
    });
  },

  getESOptions: function(model, options) {
    if (!_.isObject(model.searchOptions)) throw new Error('searchOptions must be defined');
    if (!model.id) throw new Error('Model.id must be defined');
    if (!model.type) throw new Error('Model.type must be defined');

    options = options || {};
    var esData = {
      index: this.name + this.prefixSeparator + model.searchOptions.index,
      type: model.type,
    };
    esData.id = model.id.toString();
    if (options.includeBody) {
      if (!_.isFunction(model.searchValues)) {
        throw new Error('searchValues function must be defined');
      }
      if (options.update) {
        esData.body = {
          doc: model.searchValues()
        };
      } else {
        esData.body = model.searchValues();
      }
    }
    return esData;
  },

  // prefix keys when index is a comma separated list
  prefixIndexKeys: function(index) {
    var indexes = index.split(',');
    return _.map(indexes, function(index) {
      return this.name + this.prefixSeparator + index;
    }, this).join(',');
  },

  // prefix keys when a Object type option is given
  // e.g. {indexa: 123, indexb: 455}
  prefixObjectIndexKeys: function(indexObject) {
    var prefixed = {};
    for (var key in indexObject) {
      prefixed[this.name + this.prefixSeparator + indexObject[key]];
    }
    return prefixed;
  },

  prefixMqueryOptions: function(mqueryBody) {
    var result = [];
    _.each(mqueryBody, function(opts) {
      var options = _.clone(opts);
      if (options.index) options.index = this.prefixIndexKeys(options.index);
      result.push(options);
    }, this);
    return result;
  }

});

module.exports = ElasticSearchDb;