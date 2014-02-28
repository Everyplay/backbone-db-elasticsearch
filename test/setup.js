var elasticsearch = require('elasticsearch');
var Promises = require('backbone-promises');
var Model = Promises.Model;
var Collection = Promises.Collection;
var Db = require('..');

var client = new elasticsearch.Client({
  host: 'localhost:9200',
  //log: 'trace'
});

var TestModel = Model.extend({
  type: 'test',
  url: function() {
    if (this.isNew()) {
      return this.type + 's';
    }
    return this.type + 's/' + this.get(this.idAttribute);
  },
  sync: Db.sync,
  searchOptions: {
    index: 'testidx',
  },
  indexedValues: function() {
    var json = this.toJSON();
    return json;
  }
});

var AnotherModel = TestModel.extend({
  type: 'another',
  searchOptions: {
    index: 'anotheridx'
  }
});

var TestCollection = Collection.extend({
  url: function() {
    'tests';
  },
  model: Model,
  sync: Db.sync
});

exports.setupDb = function(cb) {
  var db = new Db('elasticsearch-test', client);
  TestModel.prototype.db = db;
  TestCollection.prototype.db = db;
  this.Model = TestModel;
  this.AnotherModel = AnotherModel;
  this.db = db;
  this.Collection = TestCollection;
  cb.call(this);
};

exports.clearDb = function(cb) {
  cb();
};