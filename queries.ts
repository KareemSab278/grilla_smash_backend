const getProductsQuery: string = `SELECT
    p.id,
    p.name,
    c.name AS category,
    p.price::float,
    p.description,
    p.image,
    p.popular
FROM products p
JOIN categories c
    ON c.id = p.category_id
WHERE p.active = true
ORDER BY p.id;`


const getOptions: string = `SELECT
    c.name AS category,
    o.name,
    o.price::float,
    o.is_protein
FROM category_options co
JOIN categories c
    ON c.id = co.category_id
JOIN options o
    ON o.id = co.option_id;`


const getMeals: string = `SELECT
    name,
    price_modifier::float AS price
FROM meal_options;`


export const QUERIES: { [key: string]: { [key: string]: string } } = {
    'GET': {
        'PRODUCTS': getProductsQuery,
        'EXTRAS': getOptions,
        'MEALS': getMeals,
    },
}
