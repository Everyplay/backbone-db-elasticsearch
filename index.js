var _ = require('lodash');
var debug = require('debug')('backbone-db-elasticsearch');
var Db = require('backbone-db');
var async = require('async');
var util = require('util');

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
  var res = [];
  var noScores = _.every(hits, function(hit) {
    return !hit._score;
  });
  _.each(hits, function(hit, idx) {
    debug('convert', hit);
    var doc = {};
    // prefix ids with type because otherwise collection may have colliding ids
    doc.id = hit._type + '::' + hit._id;
    doc.content = hit._source || {};
    // add information on content type
    doc.content_type = hit._type;
    // default score is the order results are returned
    // (score is missing e.g. when sorting)
    doc.score = hit._score;
    if (noScores) doc.score = hits.length - idx;
    res.push(doc);
  });
  return res;
};

var convertMsearchResults = function(responses) {
  if (!responses || !responses.length) return [];
  var results = [];
  _.each(responses, function(resp) {
    var hits = convertResults(resp.hits.hits);
    results = results.concat(hits);
  });
  // sort by score
  return _.sortBy(results, function(r) {
    return -1 * r.score;
  });
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
    if (options.inc) {
      return this.inc(model, options, callback);
    }
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

  inc: function(model, options, callback) {
    var self = this;
    var attribute = options.inc.attribute;
    var amount = options.inc.amount;
    var esOpts = this.getESOptions(model, {update: true});
    esOpts.script = util.format('ctx._source.%s+=%d', attribute, amount);
    debug('inc', esOpts);
    this.client.update(esOpts, function(error, resp) {
      callback(null, model.toJSON());
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
      if (options.index.indexOf(',') > -1) {
        query.indexes = this.prefixIndexKeys(options.index);
      } else {
        query.index = this.prefixIndexKeys(options.index);
      }

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
      type: model.type.toLowerCase(),
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
      prefixed[this.name + this.prefixSeparator + key] = indexObject[key];
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
  },

  // creates a new index (http://www.elasticsearch.org/guide/en/elasticsearch/reference/1.x/indices-create-index.html)
  createIndex: function(options, callback) {
    var indexName = this.prefixIndexKeys(options.index);
    var opts = {
      index: indexName,
      body: {}
    };
    if (options.settings) opts.body.settings = options.settings;
    if (options.mappings) opts.body.mappings = options.mappings;
    if (options.warmers) opts.body.warmers = options.warmers;
    debug('createIndex', opts);
    this.client.indices.create(opts, function(error, resp) {
      callback(error, resp);
    });
  },

  deleteIndex: function(options, callback) {
    var indexName = this.prefixIndexKeys(options.index);
    var opts = {
      index: indexName
    };
    debug('deleteIndex', opts);
    this.client.indices.delete(opts, function(error, resp) {
      callback(error, resp);
    });
  },

  closeIndex: function(options, callback) {
    var indexName = this.prefixIndexKeys(options.index);
    this.client.indices.close({
      index: indexName
    }, callback);
  },

  openIndex: function(options, callback) {
    var indexName = this.prefixIndexKeys(options.index);
    this.client.indices.open({
      index: indexName
    }, callback);
  },

  // updating index requires closing it first
  updateIndex: function(options, callback) {
    async.series([
      this.closeIndex.bind(this, options),
      this._updateIndex.bind(this, options),
      this.openIndex.bind(this, options)
    ], callback);
  },

  _updateIndex: function(options, callback) {
    var indexName = this.prefixIndexKeys(options.index);
    var opts = {
      index: indexName,
      body: {
        settings: options.settings
      }
    };
    this.client.indices.putSettings(opts, callback);
  },

  updateMapping: function(options, callback) {
    var indexName = this.prefixIndexKeys(options.index);
    var opts = {
      index: indexName,
      type: options.type,
      body: options.mapping
    };
    this.client.indices.putMapping(opts, callback);
  },

  getMapping: function(options, callback) {
    var indexName = this.prefixIndexKeys(options.index);
    var opts = {
      index: indexName
    };
    this.client.indices.getMapping(opts, callback);
  },

  deleteMapping: function(options, callback) {
    var indexName = this.prefixIndexKeys(options.index);
    var opts = {
      index: indexName
    };
    this.client.indices.deleteMapping(opts, callback);
  }
});

module.exports = ElasticSearchDb;