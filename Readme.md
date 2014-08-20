## backbone-db-elasticsearch

## Defining search properties

Example:
```javascript
var TestModel = Model.extend({
  ...
  type: 'footype',
  searchOptions: {
    index: 'testidx',
  },
  searchValues: function() {
    return this.toJSON();
  }
});
```
### type

Type defines the document's [_type field](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/mapping-type-field.html)

### searchOptions
_seachOptions_ object must define:

-	index: index where document is stored

### searchValues
searchValues function should return Object containing keys & values to be indexed.


## Adding data to index

```javascript
var model = new TestModel({
  title: 'testtitle',
  value: 45,
  id: 1
});
model.save();
```
backbone-db-elasticsearch always expects model to have defined id, thus auto-generated ids are not supported.

After saving above model, the index contains:
```
GET testidx/test/1
{
   "_index": "testidx",
   "_type": "test",
   "_id": "1",
   "_version": 1,
   "exists": true,
   "_source": {
      "title": "testtitle",
      "value": 45,
      "id": 1
   }
}
```

## Updating a document
If you want to [update](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/docs-update.html) a document, save it with _update_ option set to true.
```javascript
var model = new TestModel({
  title: 'newtitle',
  id: 1
});
model.save(null, {update: true});
```

## Querying documents

```javascript
var query = {
  wildcard: {
    name: '*abc*'
  }
};
var collection = new this.Collection();
collection.fetch({query: query})
```
### Options

#### query

Accepts [query DSL](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-queries.html) options as Object.

#### index

Define index to search from. Supports also [multi index](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/search-search.html) syntax.

#### type

Apply search to only given [type(s)](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/search-search.html#search-multi-index-type).

#### filter

Apply [filter](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/query-dsl-query-filter.html) to the query.

#### sort

Apply [sort](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/search-request-sort.html) to query.

#### indicesBoost

[Boost](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/search-request-index-boost.html) defined indices.

#### msearch

If set to true, do a [multi search](http://www.elasticsearch.org/guide/en/elasticsearch/reference/current/search-multi-search.html)

## Notes

This adapter is not fully backbone-db compliant, since query DSL is using Elasticsearch syntax, instead of MongoDB syntax. Currently supported version of ES is 1.3.2.

### Configuration

Dynamic scripting should be enabled in `/usr/local/opt/elasticsearch/config/elasticsearch.yml`:

    script.disable_dynamic: false