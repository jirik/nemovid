-- migrate:up
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL,
  label VARCHAR (127) NOT NULL
);

-- migrate:down
