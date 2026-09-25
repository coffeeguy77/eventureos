-- Pin search_path on demo seed helpers (security advisor)
alter function demo.u(text) set search_path = '';
alter function demo.d(integer) set search_path = '';
alter function demo.at(integer, text) set search_path = '';
alter function demo.ago(integer) set search_path = '';
alter function demo.quote_snapshot(uuid, numeric) set search_path = '';
