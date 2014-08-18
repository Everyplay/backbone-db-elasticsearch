var setup = require('./setup');
var should = require('chai').should();
var Promises = require('backbone-promises');

describe('ElasticSearchDb searching tests', function() {
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

  describe('Fetch parameters', function() {
    var model;
    var model2;
    var model3;

    before(function() {
      model = new this.Model({
        id: 1,
        title: 'lorem ipsum',
        name: 'abc',
        tags: ['a', 'b'],
        meta: {
          score: 23
        }
      });
      model2 = new this.AnotherModel({
        id: 1,
        title: 'dolor sit amet',
        name: 'efgabc',
        data: 'abc',
        meta: {
          score: 90
        }
      });
      model3 = new this.Model({
        id: 2,
        title: 'hop hep',
        name: 'abc',
        tags: ['c', 'b'],
        meta: {
          score: 40
        }
      });
      return Promises.when
        .all([
          model.save(null, {wait: true}),
          model2.save(null, {wait: true}),
          model3.save(null, {wait: true})
        ]);
    });

    after(function() {
      return Promises.when
        .all([
          model.destroy(),
          model2.destroy(),
          model3.destroy()
        ]);
    });

    it('should multi match fields', function() {
      var query = {
        multi_match: {
          query: 'ab',
          fields: ['name^3', 'data'],
          type: 'phrase_prefix'
        }
      };
      collection = new this.Collection();
      return collection
        .fetch({query: query})
        .then(function() {
          collection.length.should.equal(3);
        });
    });

    it('should search using wildcard query across all indices', function() {
      var query = {
        wildcard: {
          name: '*abc*'
        }
      };
      collection = new this.Collection();
      return collection
        .fetch({query: query})
        .then(function() {
          collection.length.should.equal(3);
        });
    });

    it('should apply offset & limit (from & size)', function() {
      var query = {
        wildcard: {
          name: '*abc*'
        }
      };
      collection = new this.Collection();
      return collection
        .fetch({
          query: query,
          limit: 2,
          offset: 2
        })
        .then(function() {
          collection.length.should.equal(1);
        });

    });

    it('should search from specified indices & types', function() {
      var query = {
        wildcard: {
          name: '*abc*'
        }
      };
      collection = new this.Collection();
      return collection
        .fetch({
          query: query,
          index: 'testidx,anotheridx',
          type: 'another'
        })
        .then(function() {
          collection.length.should.equal(1);
        });
    });

    it('should search by meta score & name', function() {
      var query = {
        match: {
          name: 'abc'
        }
      };
      var filter = {
        range: {
          'meta.score': {
            gte: 30
          }
        }
      };
      collection = new this.Collection();
      return collection
        .fetch({
          query: query,
          filter: filter
        })
        .then(function() {
          collection.length.should.equal(1);
          collection.at(0).get('content').title.should.equal('hop hep');
        });
    });

    it('should boost index', function() {
      var query = {
        wildcard: {
          name: '*abc*',
        }
      };
      var boost = {
        anotheridx: 10
      };

      collection = new this.Collection();
      return collection
        .fetch({
          query: query,
          index: 'testidx,anotheridx',
          indicesBoost: boost
        })
        .then(function() {
          //console.log(collection.toJSON());
          collection.at(0).get('content').name.should.equal('efgabc');
        });
    });

    it('should apply script score', function() {
      var hasC = '(doc.containsKey("tags") && doc["tags"].values.length > 0 && doc["tags"].values.contains("c"))';
      var query = {
        function_score: {
          query: {
            matchAll: {
            }
          },
          script_score: {
            script: hasC + ' ? 100 : 0',
          },
          boost_mode: 'replace'
        }
      };
      collection = new this.Collection();
      return collection
        .fetch({
          query: query
        })
        .then(function() {
          collection.at(0).get('content').title.should.equal('hop hep');
        });
    });

    it('should sort', function() {
      var query = {
        wildcard: {
          name: '*abc*',
        }
      };
      var sort = [
        {name : 'asc'},
        '_score'
      ];
      collection = new this.Collection();
      return collection
        .fetch({
          query: query,
          index: 'testidx,anotheridx',
          sort: sort
        })
        .then(function() {
          collection.at(0).get('content').name.should.equal('abc');
        });
    });

    it('should sort ascending by metadata', function() {
      var query = {
        wildcard: {
          name: '*abc*',
        }
      };
      var sort = [
        {
          'meta.score': {
            order: 'asc'
          }
        }
      ];
      var filter = {
        range: {
          'meta.score': {
            gte: 30
          }
        }
      };
      collection = new this.Collection();
      return collection
        .fetch({
          query: query,
          sort: sort,
          filter: filter
        })
        .then(function() {
          collection.length.should.equal(2);
          collection.at(1).get('content').meta.score.should.equal(90);
        });
    });

    it('should sort descending by metadata', function() {
      var query = {
        wildcard: {
          name: '*abc*',
        }
      };
      var sort = [
        {
          'meta.score': {
            order: 'desc'
          }
        }
      ];
      var filter = {
        range: {
          'meta.score': {
            gte: 30
          }
        }
      };
      collection = new this.Collection();
      return collection
        .fetch({
          query: query,
          sort: sort,
          filter: filter
        })
        .then(function() {
          collection.length.should.equal(2);
          collection.at(1).get('content').meta.score.should.equal(40);
        });
    });
  });

  describe('Multi search', function() {
    it('should do a msearch', function() {
      var queriesBody = [
        // match all query
        { index: 'anotheridx'},
        { query: { match_all: {} } },
        // query_string query, on index/type
        { index: 'testidx', type: 'test' },
        {
          query: {
            query_string: { query: '"abc"' }
          },
          size: 1
        }
      ];
      collection = new this.Collection();
      return collection
        .fetch({
          msearch: true,
          body: queriesBody
        })
        .then(function() {
          collection.length.should.equal(2);
        });
    });

    it('should do msearch /w function_score', function() {
      var queriesBody = [
        // match all query
        { index: 'anotheridx'},
        { query: { match_all: {} } },
        // query_string query, on index/type
        { index: 'testidx', type: 'test' },
        {
          query: {
            function_score: {
              query: {
                matchAll: {
                }
              },
              script_score: {
                script: "_source.tags.contains(\"c\") ? 100 : 5",
              },
              boost_mode: 'replace'
            }
          }
        }
      ];
      collection = new this.Collection();
      return collection
        .fetch({
          msearch: true,
          body: queriesBody
        })
        .then(function() {
          collection.length.should.equal(3);
          collection.at(0).get('content').title.should.equal('hop hep');
        });
    });
  });
});