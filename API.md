# API Reference

Base URL: `http://localhost:${PORT || 3001}`

## GET /api/categories
- Returns site metadata and all categories with nested tree and blocks.
- Response:
```json
{
  "_siteTitle": "string",
  "_siteBlocks": [ ... ],
  "categories": [
    {
      "_id": "string",
      "title": "string",
      "slug": "string",
      "tree": [ ... ],
      "blocks": [ ... ]
    }
  ]
}
```

## GET /api/articles/:slug
- Params: `slug` (string)
- Returns an article with category info.
- Response:
```json
{
  "title": "string",
  "slug": "string",
  "blocks": [ ... ],
  "lastUpdated": "ISODate",
  "category": { "title": "string", "slug": "string" }
}
```

## GET /api/search?q=query
- Query: `q` (string)
- Full-text search across articles.
- Response:
```json
{
  "results": [
    {
      "title": "string",
      "slug": "string",
      "contentPreview": "string",
      "category": { "title": "string", "slug": "string" },
      "lastUpdated": "ISODate"
    }
  ]
}
```

## POST /api/publish
- Header: `x-publish-key: <PUBLISH_KEY>`
- Syncs Notion content to database.
- Response:
```json
{ "ok": true, "categories": 0, "siteTitle": "string" }
```

