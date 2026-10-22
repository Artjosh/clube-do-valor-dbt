{% macro clean_text(column) -%}
nullif(trim(cast({{ column }} as varchar)), '')
{%- endmacro %}
