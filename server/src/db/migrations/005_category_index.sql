-- "Similar items": candidates in the same category, same brand first.
CREATE INDEX products_category_brand ON products (category, brand);
