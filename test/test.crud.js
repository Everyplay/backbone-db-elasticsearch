require('mocha-as-promised')();
var setup = require('./setup');
var should = require('chai').should();

describe('ElasticSearchDb CRUD', function() {
  var model;
  var collection;

  before(function(next) {
    var self = this;
    setup.setupDb(function() {
      self.Model = this.Model;
      self.AnotherModel = this.AnotherModel;
      self.Collection = this.Collection;
      self.db = this.db;
      next();
    });
  });

  it('should create new entry in search index when saving a Model', function() {
    model = new this.Model({
      title: 'testtitle',
      value: 45,
      id: 1
    });
    model.searchOptions.index.should.equal('testidx');
    return model.save(null, {wait: true});
  });

  it('should find a document with Model fetch', function() {
    model = new this.Model({id: model.id});
    return model
      .fetch()
      .then(function() {
        model.get('title').should.equal('testtitle');
      });
  });

  it('should update a document', function() {
    model = new this.Model({id: model.id, title: 'newtitle'});
    return model.save(null, {wait: true, update: true});
  });

  it('should check that document was updated', function() {
    model = new this.Model({id: model.id});
    return model
      .fetch()
      .then(function() {
        model.get('title').should.equal('newtitle');
      });
  });

  it('should find matching Models', function() {
    var searchOptions = {
      match: {
        title: 'testtitle'
      }
    };
    collection = new this.Collection();
    return collection
      .fetch({query: searchOptions})
      .then(function() {
        collection.length.should.equal(1);
      });
  });

  it('should delete document from search index when destroying the Model', function() {
    return model.destroy();
  });
});