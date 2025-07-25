--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5 (Debian 17.5-1.pgdg110+1)
-- Dumped by pg_dump version 17.5 (Debian 17.5-1.pgdg110+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: files; Type: SCHEMA; Schema: -; Owner: nemovid
--

CREATE SCHEMA files;


ALTER SCHEMA files OWNER TO nemovid;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: file; Type: TABLE; Schema: files; Owner: nemovid
--

CREATE TABLE files.file (
    id integer NOT NULL,
    uuid uuid NOT NULL,
    label character varying(127) NOT NULL
);


ALTER TABLE files.file OWNER TO nemovid;

--
-- Name: files_id_seq; Type: SEQUENCE; Schema: files; Owner: nemovid
--

CREATE SEQUENCE files.files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE files.files_id_seq OWNER TO nemovid;

--
-- Name: files_id_seq; Type: SEQUENCE OWNED BY; Schema: files; Owner: nemovid
--

ALTER SEQUENCE files.files_id_seq OWNED BY files.file.id;


--
-- Name: file id; Type: DEFAULT; Schema: files; Owner: nemovid
--

ALTER TABLE ONLY files.file ALTER COLUMN id SET DEFAULT nextval('files.files_id_seq'::regclass);


--
-- Name: file files_pkey; Type: CONSTRAINT; Schema: files; Owner: nemovid
--

ALTER TABLE ONLY files.file
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: file files_uuid_key; Type: CONSTRAINT; Schema: files; Owner: nemovid
--

ALTER TABLE ONLY files.file
    ADD CONSTRAINT files_uuid_key UNIQUE (uuid);


--
-- PostgreSQL database dump complete
--

