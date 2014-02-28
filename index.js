var _ = require('lodash');
var debug = require('debug')('backbone-db-elasticsearch');
var Db = require('backbone-db');

function ElasticSearchDb(name, client) {
  if (!client) {
    throw new Error('ElasticSearch client must be provided');
  }
  this.name = name || '';
  this.client = client;
}

ElasticSearchDb.sync = Db.sync;

var getESOptions = function(model, options) {
  if (!_.isObject(model.searchOptions)) throw new Error('searchOptions must be defined');
  if (!model.id) throw new Error('Model.id must be defined');
  if (!model.type) throw new Error('Model.type must be defined');

  options = options || {};
  var esData = {
    index: model.searchOptions.index,
    type: model.type,
  };
  esData.id = model.id.toString();
  if (options.includeBody) {
    if (!_.isFunction(model.indexedValues)) {
      throw new Error('indexedValues function must be defined');
    }
    if (options.update) {
      esData.body = {
        doc: model.indexedValues()
      };
    } else {
      esData.body = model.indexedValues();
    }
  }
  return esData;
};

var convertResults = function(hits) {
  if (!hits || !hits.length) return [];
  return _.map(hits, function(hit) {
    var doc = {};
    // prefix ids with type because otherwise collection may have colliding ids
    doc.id = hit._type + '::' + hit._id;
    doc.content = hit._source || {};
    // add information on content type
    doc.content_type = hit._type;
    return doc;
  });
};

_.extend(ElasticSearchDb.prototype, Db.prototype, {
  create: function(model, options, callback) {
    var self = this;
    this.client.create(getESOptions(model, {
      includeBody: true
    }), function(error, resp) {
      if (options.wait === true) {
        self._refreshIndices(null, function(err, res) {
          callback(error, model.toJSON());
        });
      } else {
        callback(error, model.toJSON());
      }
    });
  },

  find: function(model, options, callback) {
    this.client.get(getESOptions(model), function(error, resp) {
      if (error) return callback(error);
      model.set(resp._source);
      callback(error, model.toJSON());
    });
  },

  findAll: function(collection, options, callback) {
    var query = {
      body: {
        query: options.query
      }
    };
    if (options.index) query.index = options.index;
    if (options.type) query.type = options.type;

    if (options.offset || options.from) {
      query.body.from = options.offset || options.from || 0;
    }
    if (options.limit || options.size) {
      query.body.size = options.limit || options.size || 0;
    }
    if (options.filter) query.body.filter = options.filter;
    if (options.indicesBoost) query.body.indicesBoost = options.indicesBoost;
    if (options.sort) query.body.sort = options.sort;

    debug('findAll query', query);
    this.client.search(query, function(error, resp) {
      if (error) return callback(error);
      debug('findAll results', JSON.stringify(resp));
      callback(null, convertResults(resp.hits.hits));
    });
  },

  update: function(model, options, callback) {
    options = options || {};
    if (!options.update) return this.create.apply(this, arguments);
    this.client.update(getESOptions(model, {
      includeBody: true,
      update: true
    }), function(error, resp) {
      callback(error, model.toJSON());
    });
  },

  destroy: function(model, options, callback) {
    this.client.delete(getESOptions(model), function(error, resp) {
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
  }
});

module.exports = ElasticSearchDb;