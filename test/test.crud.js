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
      self.CustomIndexModel = this.CustomIndexModel;
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

  it('should inc a field', function() {
    return model.save(null, {
      update: true,
      inc: {
        amount: 1,
        attribute: 'value'
      }
    });
  });

  it('should check that document was updated', function() {
    model = new this.Model({id: model.id});
    return model
      .fetch()
      .then(function() {
        model.get('value').should.equal(46);
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

  it('should upsert a document', function() {
    var model2 = new this.Model({id: 2, value: 99});
    return model2.save(null, {
      update: true,
      upsert: true
    });
  });

  it('should fetch upserted doc', function() {
    var model2 = new this.Model({id: 2});
    return model2
      .fetch()
      .then(function() {
        var json = model2.toJSON();
        json.value.should.equal(99);
      });
  });

  it('should delete the upserted doc', function() {
    var model2 = new this.Model({id: 2});
    return model2.destroy();
  });

  describe('custom index', function() {
    var custom;

    it('should save model to custom index', function() {
      custom = new this.CustomIndexModel({id: 1, name: 'customfoo'});
      return custom.save(null, {wait: true});
    });

    it('should search using custom index', function() {
      // read from custom index
      var searchOptions = {
        indexAlias: custom.searchOptions.indexAlias,
        filter: {
          term: {
            name: 'customfoo'
          }
        }
      };
      var c = new this.Collection();
      return c.fetch(searchOptions).then(function() {
        c.length.should.equal(1);
      });
    });

    it('should msearch', function() {
      var queriesBody = [
        { indexAlias: custom.searchOptions.indexAlias},
        { query: { match_all: {} } },
        { index: 'testidx', type: 'test' },
        { query: { match_all: {} } }
      ];
      collection = new this.Collection();
      return collection
        .fetch({
          msearch: true,
          body: queriesBody
        })
        .then(function() {
          collection.length.should.equal(1);
        });
    });

    it('should destroy model', function() {
        return custom.destroy();
    });
  });

  describe('Index CRUD', function() {
    it('should create index', function(next) {
      var indexSettings = {
        analysis: {
          analyzer: {
            uax_url_email : {
              filter : [
                "standard",
                "lowercase",
                "stop"
             ],
             tokenizer : "uax_url_email"
            }
          }
        }
      };
      this.db.createIndex({
        index: 'foobar',
        settings: indexSettings
      }, function(err) {
        next(err);
      });
    });

    it.skip('should update index settings', function(next) {
      var indexSettings = {
        mappings: {
          info: {
            _all : {
              type: 'string',
              analyzer: 'uax_url_email'
            }
          }
        }
      };
      this.db.updateIndex({
        index: 'foobar',
        settings: indexSettings
      }, function(err) {
        next(err);
      });
    });

    it('should update index mappings', function(next) {
      var mapping = {
        'mytype': {
          properties: {
            message: {
              type: 'string',
              store: true,
              analyzer: 'uax_url_email'
            }
          }
        }
      };
      this.db.updateMapping({
        index: 'foobar',
        type: 'mytype',
        mapping: mapping
      }, function(err) {
        next(err);
      });
    });

    it('should get mapping', function(next) {
      this.db.getMapping({
        index: 'foobar'
      }, function(err, resp) {
        should.exist(resp);
        next(err);
      });
    });

    it('should delete index', function(next) {
      this.db.deleteIndex({
        index: 'foobar'
      }, function(err) {
        next(err);
      });
    });
  });

});