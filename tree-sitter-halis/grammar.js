/**
 * tree-sitter-halis — bộ khung grammar cho ngôn ngữ Halis.
 *
 * Dựng theo SPEC.md của mhieuhonda/halis-lang (HLS v0.2 trở lên):
 *   - §2  lexical rules : comment `#`, identifier, số có `_`, string với
 *     4 escape (`\n` `\t` `\\` `\"`), không cho newline thô trong string.
 *   - §4  program       : crate_attr, structdef, enumdef, impl, fndef,
 *     import "path" (import là string literal, không phải identifier!).
 *   - §5  statements    : let [mut], assignment, if/else, while, for..in,
 *     return, break, continue, match (arm là `pattern => expr`).
 *   - §6  expressions   : 9 mức ưu tiên, `?` là postfix error-propagation,
 *     struct literal `Name { f: e }`, list literal `[a, b]`.
 *
 * Là BỘ KHUNG (scaffold): phần lexical và cấu trúc khớp SPEC, nhưng chưa
 * tinh chỉnh precedence cho mọi corner case. Chưa có: `#[...]` attribute
 * list (Stage 28+ — hiện bị line_comment nuốt, xem TODO bên dưới),
 * bitwise operators (SPEC v0.3: chưa có trong ngôn ngữ).
 */

const PREC = {
  OR: 1,
  AND: 2,
  EQUALITY: 3,
  COMPARE: 4,
  SUM: 5,
  PRODUCT: 6,
  UNARY: 7,
  PROPAGATE: 8,
  POSTFIX: 9,
};

module.exports = grammar({
  name: 'halis',

  extras: $ => [/\s/, $.line_comment],

  word: $ => $.identifier,

  supertypes: $ => [$._expression, $._statement],

  // `xs[i] = v` hay `xs[i]` đứng một mình? GLR parse cả hai nhánh,
  // tầng statement sẽ tự phân xử theo dấu `=` phía sau.
  conflicts: $ => [[$.lvalue, $._expression]],

  rules: {
    source_file: $ => repeat(choice($.crate_attribute, $._top_level_declaration)),

    _top_level_declaration: $ => choice(
      $.struct_definition,
      $.enum_definition,
      $.impl_block,
      $.function_definition,
      $.import_statement,
    ),

    // TODO Stage 28+: `#[...]` là outer attribute list, không phải comment.
    // Hiện tại examples của halis-lang chưa dùng nên tạm nuốt hết `#...`,
    // tới stage đó cần tách ra thành rule riêng, cẩn thận với `#! note`
    // (vẫn là comment) và `#![...]` (crate attribute).
    line_comment: $ => token(seq('#', /.*/)),

    // §31–32 Stage 77/78: chỉ có hai crate attribute.
    crate_attribute: $ => seq('#![', choice('freestanding', 'no_std'), ']'),

    // §2.4: [A-Za-z_][A-Za-z0-9_]*
    identifier: $ => /[A-Za-z_][A-Za-z0-9_]*/,

    // §2.6: có `_` cho dễ đọc (1_000_000), KHÔNG có ký hiệu khoa học.
    integer: $ => token(/[0-9][0-9_]*/),
    float: $ => token(seq(/[0-9][0-9_]*/, '.', /[0-9][0-9_]*/)),

    // §2.7: chỉ 4 escape, string chứa newline thô là lỗi.
    string: $ => seq('"', repeat(choice($.escape_sequence, /[^"\\\n]/)), '"'),
    escape_sequence: $ => token(/\\[nt\\"]/),

    // ---- §4 types ----
    _type: $ => choice(
      $.primitive_type,
      $.list_type,
      $.map_type,
      $.named_type,
      'void',
    ),

    primitive_type: $ => choice('int', 'float', 'bool', 'str'),
    list_type: $ => seq('list', '[', field('element', $._type), ']'),
    // map[str, T] — chìa khóa luôn là str theo SPEC.
    map_type: $ => seq('map', '[', 'str', ',', field('value', $._type), ']'),
    named_type: $ => seq(field('name', $.identifier), optional($.type_arguments)),
    type_arguments: $ => seq('[', commaSep1($._type), ']'),

    // ---- §4 program structure ----
    struct_definition: $ => seq(
      'struct', field('name', $.identifier), optional($.type_parameters),
      '{', commaSep($.struct_field), '}',
    ),
    struct_field: $ => seq(
      field('name', $.identifier), ':', field('type', $._type),
      optional(seq('=', field('default', $._expression))),
    ),

    enum_definition: $ => seq(
      'enum', field('name', $.identifier), optional($.type_parameters),
      '{', commaSep($.enum_variant), '}',
    ),
    enum_variant: $ => seq(
      field('name', $.identifier),
      optional(seq('(', commaSep($._type), ')')),
    ),

    type_parameters: $ => seq('[', commaSep1($.identifier), ']'),

    impl_block: $ => seq(
      'impl', field('name', $.identifier),
      '{', repeat($.function_definition), '}',
    ),

    function_definition: $ => seq(
      'fn', field('name', $.identifier), optional($.type_parameters),
      '(', optional($.parameter_list), ')',
      optional(seq('->', field('return_type', $._type))),
      optional(field('effects', choice('pure', $.uses_clause))),
      field('body', $.block),
    ),
    parameter_list: $ => seq(commaSep1($.parameter), optional(',')),
    parameter: $ => seq(
      optional('mut'),
      field('name', $.identifier), ':', field('type', $._type),
    ),
    // §9: effect := IO | Fs | Clock | Args | Exit — parse rộng (identifier),
    // phần kiểm tra tên effect là việc của semantic, không phải của lexer.
    uses_clause: $ => seq('uses', commaSep1(field('effect', $.identifier))),

    // §4.1: import "path/to/file.hls" — đường dẫn là string literal.
    import_statement: $ => seq('import', field('path', $.string)),

    block: $ => seq('{', repeat($._statement), '}'),

    // ---- §5 statements ----
    _statement: $ => choice(
      $.let_statement,
      $.assignment,
      $.if_statement,
      $.while_statement,
      $.for_statement,
      $.return_statement,
      'break',
      'continue',
      $.expression_statement,
    ),

    let_statement: $ => seq(
      'let', optional('mut'), field('name', $.identifier),
      ':', field('type', $._type), '=', field('value', $._expression),
    ),
    assignment: $ => seq(
      field('left', $.lvalue), '=', field('right', $._expression),
    ),
    lvalue: $ => seq(
      $.identifier,
      repeat(choice(seq('.', $.identifier), seq('[', $._expression, ']'))),
    ),

    if_statement: $ => prec.right(seq(
      'if', field('condition', $._expression), field('consequence', $.block),
      optional(choice(
        seq('else', $.if_statement),
        seq('else', field('alternative', $.block)),
      )),
    )),
    while_statement: $ => seq(
      'while', field('condition', $._expression), field('body', $.block),
    ),
    for_statement: $ => seq(
      'for', field('variable', $.identifier), ':', field('type', $._type),
      'in', field('iterator', $._expression), field('body', $.block),
    ),
    // prec.right: thấy `return identifier` thì identifier thuộc về biểu thức
    // của chính câu return đó, KHÔNG phải statement mới sau return rỗng.
    return_statement: $ => prec.right(seq('return', optional($._expression))),

    // §5: expression-statement phải là call — phần đó semantic kiểm tra,
    // grammar cho phép mọi expression đứng một mình.
    expression_statement: $ => $._expression,

    // ---- §6 expressions: 9 mức ưu tiên ----
    _expression: $ => choice(
      $.binary_expression,
      $.unary_expression,
      $.propagation_expression,
      $.call_expression,
      $.field_expression,
      $.index_expression,
      $.match_expression,
      $.struct_literal,
      $.list_literal,
      $.parenthesized_expression,
      $.identifier,
      $.integer,
      $.float,
      $.string,
      'true',
      'false',
    ),

    binary_expression: $ => choice(
      prec.left(PREC.OR, seq($._expression, '||', $._expression)),
      prec.left(PREC.AND, seq($._expression, '&&', $._expression)),
      prec.left(PREC.EQUALITY, seq($._expression, choice('==', '!='), $._expression)),
      prec.left(PREC.COMPARE, seq($._expression, choice('<', '<=', '>', '>='), $._expression)),
      prec.left(PREC.SUM, seq($._expression, choice('+', '-'), $._expression)),
      prec.left(PREC.PRODUCT, seq($._expression, choice('*', '/', '%'), $._expression)),
    ),

    unary_expression: $ => prec(PREC.UNARY, seq(choice('!', '-'), $._expression)),

    // §12: `expr?` — error propagation, mức 8, ngay dưới postfix.
    propagation_expression: $ => prec(PREC.PROPAGATE, seq($._expression, '?')),

    call_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('function', choice($.identifier, $.field_expression)),
      '(', optional(seq(commaSep1($._expression), optional(','))), ')',
    )),

    field_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('object', $._expression), '.', field('field', $.identifier),
    )),

    index_expression: $ => prec.left(PREC.POSTFIX, seq(
      field('object', $._expression), '[', field('index', $._expression), ']',
    )),

    // §5: arm := pattern "=>" expr; pattern có wildcard `_`.
    match_expression: $ => prec.right(seq(
      'match', field('value', $._expression),
      '{', optional(seq(commaSep($.match_arm), optional(','))), '}',
    )),
    match_arm: $ => seq(
      field('pattern', $.pattern), '=>', field('value', $._expression),
    ),
    pattern: $ => choice(
      seq(
        optional(seq($.identifier, '.')),
        field('variant', $.identifier),
        optional(seq('(', commaSep($.identifier), ')')),
      ),
      '_',
    ),

    // §6: Name { f1: e1, f2: e2 } — struct literal, field viết tên tường minh.
    // prec(-1): thấp hơn mọi statement — khi gặp `while i < n { ... }`
    // phải hiểu `n` là biểu thức và `{` là block, KHÔNG phải struct literal
    // (SPEC cấm struct literal trong vị trí điều kiện).
    struct_literal: $ => prec(-1, seq(
      $.identifier, '{',
      optional(seq(commaSep(seq(
        field('name', $.identifier), ':', field('value', $._expression),
      )), optional(','))),
      '}',
    )),

    list_literal: $ => seq(
      '[', optional(seq(commaSep1($._expression), optional(','))), ']',
    ),

    parenthesized_expression: $ => seq('(', $._expression, ')'),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
