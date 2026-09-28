/* =============================================================================
   码迹 · 本地示例数据
   -----------------------------------------------------------------------------
   新用户第一次打开应用时写入数据库，让界面立刻可用、可读、可讲课。
   所有内容都是真实的学习笔记片段，不使用编造的统计数字。
   时间基于“启动时刻”相对生成，保证任何时候打开都符合真实学习节奏。
   ============================================================================= */

import type {
  CodeSnippet,
  Course,
  Exercise,
  Note,
  ReviewItem,
  UserSettings,
} from './types';
import { DEFAULT_SETTINGS } from './types';
import { MASTERED_AFTER } from './review';
import {
  bulletList,
  callout,
  codeBlock,
  doc,
  heading,
  orderedList,
  outputBlock,
  paragraph,
  taskList,
  type Doc,
} from './noteDoc';
import { docToPlainText, noteExcerpt } from './noteDoc';

const MINUTE = 60 * 1000;

export interface SeedData {
  courses: Course[];
  notes: Note[];
  snippets: CodeSnippet[];
  exercises: Exercise[];
  reviewItems: ReviewItem[];
  settings: UserSettings;
}

interface NoteSeed {
  id: string;
  courseId: string;
  title: string;
  language: Note['language'];
  tags: string[];
  favorite?: boolean;
  /** 距今多少分钟前更新 */
  updatedMinutesAgo: number;
  lastOpenedMinutesAgo?: number;
  content: Doc;
}

interface ReviewSeed {
  id: string;
  noteId: string;
  title: string;
  summary: string;
  /** 到期时间的语义化预设，实际时间在播种时按当前时刻计算 */
  due: ReviewDuePreset | null;
  reviewCount: number;
  state: ReviewItem['state'];
  lastReviewedMinutesAgo: number | null;
  confidence: ReviewItem['confidence'];
}

/**
 * 复习到期时间的预设。用语义而不是「多少分钟之后」，
 * 保证任何时候打开应用，复习节奏都符合真实的日历习惯（早上 9 点）。
 */
type ReviewDuePreset =
  | 'overdue-1-day'
  | 'overdue-2-hours'
  | 'overdue-45-minutes'
  | 'tomorrow-9am'
  | 'in-2-days-9am'
  | 'in-3-days-9am'
  | 'in-5-days-9am';

function atHour(date: Date, hour: number): Date {
  const copy = new Date(date);
  copy.setHours(hour, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function resolveDuePreset(preset: ReviewDuePreset | null, now: Date): string | null {
  switch (preset) {
    case null:
      return null;
    case 'overdue-1-day':
      return new Date(now.getTime() - 26 * 60 * MINUTE).toISOString();
    case 'overdue-2-hours':
      return new Date(now.getTime() - 120 * MINUTE).toISOString();
    case 'overdue-45-minutes':
      return new Date(now.getTime() - 45 * MINUTE).toISOString();
    case 'tomorrow-9am':
      return atHour(addDays(now, 1), 9).toISOString();
    case 'in-2-days-9am':
      return atHour(addDays(now, 2), 9).toISOString();
    case 'in-3-days-9am':
      return atHour(addDays(now, 3), 9).toISOString();
    case 'in-5-days-9am':
      return atHour(addDays(now, 5), 9).toISOString();
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ 课程 */

export const SEED_COURSES: Course[] = [
  {
    id: 'course_python',
    name: 'Python 入门',
    description: '第 3 周 · 函数与模块',
    language: 'python',
    track: 'python',
    colorKey: 'teal',
    iconKey: 'braces',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'course_web',
    name: 'Web 前端基础',
    description: 'HTML / CSS / JavaScript',
    language: 'html',
    track: 'html',
    colorKey: 'blue',
    iconKey: 'layout',
    sortOrder: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'course_java',
    name: 'Java 面向对象',
    description: '类、继承、接口',
    language: 'java',
    track: 'java',
    colorKey: 'amber',
    iconKey: 'coffee',
    sortOrder: 2,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'course_algo',
    name: '数据结构与算法',
    description: '配合 C 语言练习',
    language: 'c',
    track: 'c',
    colorKey: 'violet',
    iconKey: 'binary',
    sortOrder: 3,
    createdAt: '',
    updatedAt: '',
  },
];

/* ------------------------------------------------------------------ 笔记正文 */

/** 核心示例笔记：与设计稿完全一致 */
const functionNoteDoc: Doc = doc(
  heading(2, '为什么需要函数'),
  paragraph('函数可以把一段可重复使用的逻辑组织起来，并通过参数接收外部数据。'),
  heading(2, '一个最小的例子'),
  codeBlock(
    'python',
    ['def greet(name):', '    return f"你好，{name}！"', '', 'message = greet("小林")', 'print(message)'].join(
      '\n',
    ),
  ),
  outputBlock('你好，小林！'),
  heading(2, '形参和实参'),
  paragraph(
    '`name` 是**形参**，写在函数定义里，相当于一个占位符；`"小林"` 是调用函数时传入的**实参**，是真正参与运算的数据。',
  ),
  bulletList([
    '形参：函数定义时括号里的名字，可以有多个，用逗号分隔',
    '实参：调用函数时真正传进去的值，顺序要和形参一一对应',
    '调用 `greet("小林")` 时，Python 把 `"小林"` 绑定到 `name` 上，再执行函数体',
  ]),
  callout(
    'tip',
    '容易混淆',
    paragraph('`return` 会把结果交还给调用者；`print` 只负责显示内容，不会把结果传出去。'),
    codeBlock(
      'python',
      ['def add(a, b):', '    print(a + b)      # 屏幕上显示 3，但函数返回 None', '', 'result = add(1, 2)', 'print(result)     # None'].join(
        '\n',
      ),
    ),
  ),
  heading(2, '动手练习'),
  paragraph('编写一个函数，接收两个数字并返回它们的和。'),
  taskList([
    { text: '写出 `add(a, b)`，用 `return` 返回结果' },
    { text: '把 `return` 改成 `print`，观察调用处拿到的是什么' },
  ]),
  heading(2, '常见报错'),
  callout(
    'warning',
    '常见报错',
    paragraph('少传一个参数时 Python 会直接报错，错误信息里会写清楚缺了几个：'),
    codeBlock('python', 'TypeError: greet() missing 1 required positional argument: \'name\''),
  ),
);

const variableNoteDoc: Doc = doc(
  heading(2, '三种最常用的类型'),
  paragraph('刚开始只需要分清 `int`、`float`、`str` 三种，其他类型遇到再查。'),
  codeBlock(
    'python',
    ['age = 18            # int', 'price = 9.9         # float', 'name = "小林"        # str', '', 'print(type(age), type(price), type(name))'].join(
      '\n',
    ),
  ),
  outputBlock("<class 'int'> <class 'float'> <class 'str'>"),
  callout('tip', '容易混淆', paragraph('`"18"` 是字符串，`18` 才是数字，`"18" + 1` 会直接报错。')),
  heading(2, '类型转换'),
  paragraph('从输入框读到的内容永远是字符串，参与计算前要先转换。'),
  codeBlock('python', ['age = int(input("你几岁？"))', 'print(f"明年你 {age + 1} 岁")'].join('\n')),
  taskList([{ text: '把 `"3.14"` 转成 float 再乘 2' }, { text: '试试 `int("3.14")` 会发生什么' }]),
);

const loopNoteDoc: Doc = doc(
  heading(2, 'if / elif / else'),
  paragraph('条件从上往下判断，命中一个分支后就不再往下走。'),
  codeBlock(
    'python',
    ['score = 86', '', 'if score >= 90:', '    print("优秀")', 'elif score >= 60:', '    print("及格")', 'else:', '    print("需要再练练")'].join(
      '\n',
    ),
  ),
  outputBlock('及格'),
  heading(2, 'for 循环'),
  paragraph('`range(1, 5)` 只会给出 1、2、3、4，右边界不包含在内，这是最容易记错的地方。'),
  codeBlock(
    'python',
    ['total = 0', 'for number in range(1, 5):', '    total += number', '', 'print(total)   # 10'].join('\n'),
  ),
  outputBlock('10'),
  callout('tip', '容易混淆', paragraph('想数到 5 要写 `range(1, 6)`；`range(5)` 等价于 `range(0, 5)`，从 0 开始。')),
  heading(2, 'while 循环'),
  paragraph('次数不确定时用 `while`，但一定要有能让条件变假的语句，否则会死循环。'),
);

const listNoteDoc: Doc = doc(
  heading(2, '列表：一串有序的数据'),
  codeBlock(
    'python',
    ['scores = [88, 92, 75]', 'scores.append(100)', 'print(scores[0], len(scores))'].join('\n'),
  ),
  outputBlock('88 4'),
  heading(2, '字典：按名字取数据'),
  paragraph('字典的键必须是不可变类型，所以列表不能当键，字符串和数字可以。'),
  codeBlock(
    'python',
    ['student = {"name": "小林", "age": 18}', 'student["city"] = "杭州"', 'print(student.get("score", "暂无成绩"))'].join(
      '\n',
    ),
  ),
  outputBlock('暂无成绩'),
  callout('tip', '容易混淆', paragraph('用 `student["score"]` 取不存在的键会报 KeyError，`get()` 可以给默认值。')),
  heading(2, '什么时候用哪个'),
  orderedList([
    '需要顺序、需要重复、需要按下标取 → 列表',
    '需要按名字找、数据是一组属性 → 字典',
    '数据一旦确定不再修改 → 元组',
  ]),
);

const indentErrorDoc: Doc = doc(
  heading(2, '报错原文'),
  codeBlock('python', 'IndentationError: expected an indented block after function definition on line 1'),
  heading(2, '为什么会这样'),
  paragraph('`def` 那一行以冒号结尾，说明后面要跟一段属于它的代码，但这行下面没有缩进。'),
  codeBlock('python', ['def greet(name):', 'return f"你好，{name}！"   # 少了缩进'].join('\n')),
  heading(2, '正确的写法'),
  codeBlock('python', ['def greet(name):', '    return f"你好，{name}！"   # 四个空格'].join('\n')),
  callout('tip', '容易混淆', paragraph('同一个代码块里缩进必须一致：要么都用 4 个空格，要么都用 Tab，不要混着来。')),
  taskList([{ text: '在编辑器里打开“显示空白字符”，确认没有混用 Tab', checked: true }]),
);

const importNoteDoc: Doc = doc(
  heading(2, '导入标准库'),
  codeBlock('python', ['import random', 'from datetime import date', '', 'print(random.randint(1, 6))'].join('\n')),
  heading(2, '导入自己写的模块'),
  paragraph('同一目录下的 `tools.py` 可以直接按文件名导入，不需要写 `.py`。'),
  codeBlock('python', ['from tools import add', '', 'print(add(1, 2))'].join('\n')),
  callout('note', '约定', paragraph('导入写在文件顶部，先标准库、再第三方、最后自己的模块，读起来最清楚。')),
);

const htmlNoteDoc: Doc = doc(
  heading(2, '页面骨架'),
  codeBlock(
    'html',
    ['<!doctype html>', '<html lang="zh-CN">', '  <head>', '    <meta charset="UTF-8" />', '    <title>我的第一个页面</title>', '  </head>', '  <body>', '    <h1>你好，世界</h1>', '  </body>', '</html>'].join(
      '\n',
    ),
  ),
  heading(2, '常用标签'),
  bulletList([
    '`h1` ~ `h6`：标题，一个页面只用一个 `h1`',
    '`p`：段落；`ul` / `ol` / `li`：列表',
    '`a href="..."`：链接；`img src="..." alt="..."`：图片',
    '`div` / `span`：没有语义的容器，用来分组',
  ]),
  callout('tip', '容易混淆', paragraph('`alt` 不是可选项：图片加载失败时它会显示出来，读屏软件也靠它描述图片。')),
);

const boxModelNoteDoc: Doc = doc(
  heading(2, '一个盒子由四层组成'),
  paragraph('从里到外依次是 content、padding、border、margin。'),
  codeBlock(
    'css',
    ['.card {', '  width: 320px;', '  padding: 16px;', '  border: 1px solid #e3e8ec;', '  margin-bottom: 12px;', '}'].join(
      '\n',
    ),
  ),
  callout('tip', '容易混淆', paragraph('默认 `box-sizing: content-box` 时，`width` 只算内容区，加上 padding 和 border 后实际会更宽。')),
  codeBlock(
    'css',
    ['*, *::before, *::after {', '  box-sizing: border-box;   /* 让 width 包含 padding 和 border */', '}'].join('\n'),
  ),
  heading(2, '外边距合并'),
  paragraph('上下相邻的两个块，垂直方向的 margin 会取较大值，而不是相加。'),
);

const flexNoteDoc: Doc = doc(
  heading(2, '三栏布局的最小写法'),
  codeBlock(
    'css',
    ['.layout {', '  display: flex;', '  gap: 16px;', '}', '', '.sidebar { flex: 0 0 240px; }', '.main    { flex: 1 1 auto; min-width: 0; }', '.aside   { flex: 0 0 250px; }'].join(
      '\n',
    ),
  ),
  bulletList([
    '`flex: 0 0 240px`：不放大、不缩小，固定 240px',
    '`flex: 1 1 auto`：占据剩余空间',
    '`min-width: 0`：让中间列在内容过长时也能收缩，否则会把旁边挤出去',
  ]),
  heading(2, '主轴对齐'),
  codeBlock('css', ['justify-content: space-between;  /* 主轴 */', 'align-items: center;            /* 交叉轴 */'].join('\n')),
);

const querySelectorNoteDoc: Doc = doc(
  heading(2, '选取元素'),
  codeBlock(
    'javascript',
    ['const title = document.querySelector("h1");', 'const items = document.querySelectorAll(".note-item");', '', 'console.log(items.length);'].join(
      '\n',
    ),
  ),
  callout('tip', '容易混淆', paragraph('`querySelector` 返回第一个匹配的元素，`querySelectorAll` 返回的是 NodeList，要用 `forEach` 遍历。')),
  heading(2, '绑定点击事件'),
  codeBlock(
    'javascript',
    ['const button = document.querySelector("#save");', '', 'button.addEventListener("click", () => {', '  console.log("已保存");', '});'].join(
      '\n',
    ),
  ),
  outputBlock('已保存'),
);

const classNoteDoc: Doc = doc(
  heading(2, '类与对象'),
  codeBlock(
    'java',
    ['public class Student {', '    private String name;', '    private int age;', '', '    public Student(String name, int age) {', '        this.name = name;', '        this.age = age;', '    }', '', '    public String getName() {', '        return name;', '    }', '}'].join(
      '\n',
    ),
  ),
  paragraph('`this.name` 指的是对象的属性，右边的 `name` 是构造方法的参数，两者同名时必须用 `this` 区分。'),
  heading(2, '创建对象'),
  codeBlock('java', ['Student s = new Student("小林", 18);', 'System.out.println(s.getName());'].join('\n')),
  outputBlock('小林'),
);

const inheritNoteDoc: Doc = doc(
  heading(2, '继承与方法重写'),
  codeBlock(
    'java',
    ['public class GraduateStudent extends Student {', '    public GraduateStudent(String name, int age) {', '        super(name, age);', '    }', '', '    @Override', '    public String toString() {', '        return "研究生：" + getName();', '    }', '}'].join(
      '\n',
    ),
  ),
  callout('tip', '容易混淆', paragraph('`@Override` 写错方法名时编译会直接报错，加上它能避免“以为重写了其实没有”。')),
  heading(2, 'super 的两种用法'),
  orderedList(['`super(...)`：调用父类构造方法，必须写在第一行', '`super.method()`：调用父类被重写的方法']),
);

const interfaceNoteDoc: Doc = doc(
  heading(2, '接口定义“能做什么”'),
  codeBlock(
    'java',
    ['public interface Payable {', '    double calculatePay();', '}', '', 'public class PartTimeJob implements Payable {', '    @Override', '    public double calculatePay() {', '        return 120.0;', '    }', '}'].join(
      '\n',
    ),
  ),
  heading(2, '怎么选'),
  bulletList([
    '多个不相关的类需要同一套行为 → 接口',
    '多个类共享同一段代码和字段 → 抽象类',
    '拿不准时先用接口，Java 只能单继承，接口更灵活',
  ]),
  callout('note', '设计原则', paragraph('面向接口编程：调用方只依赖 `Payable`，换成别的实现不用改代码。')),
);

const arrayListNoteDoc: Doc = doc(
  heading(2, '数组'),
  codeBlock(
    'c',
    ['int scores[3] = {88, 92, 75};', 'printf("%d\\n", scores[1]);   // 92', '', '// 数组长度固定，越界不会报错，只会读到别的内存'].join(
      '\n',
    ),
  ),
  outputBlock('92'),
  heading(2, '链表节点'),
  codeBlock(
    'c',
    ['struct Node {', '    int value;', '    struct Node *next;', '};'].join('\n'),
  ),
  callout('tip', '容易混淆', paragraph('数组按下标访问是 O(1)，插入删除要搬数据；链表插入删除快，但只能从头一个个找。')),
);

const recursionNoteDoc: Doc = doc(
  heading(2, '递归的两个必要部分'),
  orderedList(['终止条件：什么时候停下来', '递推关系：把大问题拆成更小的问题']),
  codeBlock(
    'c',
    ['int sum(int n) {', '    if (n <= 1) return n;      // 终止条件', '    return n + sum(n - 1);     // 递推关系', '}'].join(
      '\n',
    ),
  ),
  heading(2, '调用过程'),
  paragraph('`sum(3)` → `3 + sum(2)` → `3 + 2 + sum(1)` → `3 + 2 + 1`，每一层都在等下一层返回。'),
  callout('warning', '常见报错', paragraph('忘记写终止条件会栈溢出：`Segmentation fault (core dumped)`。')),
  taskList([{ text: '用递归改写阶乘函数，并画出调用栈' }]),
);

const NOTE_SEEDS: NoteSeed[] = [
  {
    id: 'note_func_args',
    courseId: 'course_python',
    title: '函数与参数',
    language: 'python',
    tags: ['Python', '函数', '基础语法'],
    favorite: true,
    updatedMinutesAgo: 42,
    lastOpenedMinutesAgo: 42,
    content: functionNoteDoc,
  },
  {
    id: 'note_variables',
    courseId: 'course_python',
    title: '变量与数据类型',
    language: 'python',
    tags: ['Python', '基础语法'],
    updatedMinutesAgo: 3 * 60,
    lastOpenedMinutesAgo: 3 * 60,
    content: variableNoteDoc,
  },
  {
    id: 'note_loops',
    courseId: 'course_python',
    title: '条件判断与循环',
    language: 'python',
    tags: ['Python', '控制流'],
    updatedMinutesAgo: 26 * 60,
    lastOpenedMinutesAgo: 26 * 60,
    content: loopNoteDoc,
  },
  {
    id: 'note_lists',
    courseId: 'course_python',
    title: '列表与字典',
    language: 'python',
    tags: ['Python', '数据结构'],
    favorite: true,
    updatedMinutesAgo: 2 * 24 * 60,
    lastOpenedMinutesAgo: 2 * 24 * 60,
    content: listNoteDoc,
  },
  {
    id: 'note_indent_error',
    courseId: 'course_python',
    title: '报错记录：IndentationError',
    language: 'python',
    tags: ['Python', '报错记录'],
    updatedMinutesAgo: 4 * 24 * 60,
    content: indentErrorDoc,
  },
  {
    id: 'note_import',
    courseId: 'course_python',
    title: '模块与导入',
    language: 'python',
    tags: ['Python', '模块'],
    updatedMinutesAgo: 6 * 24 * 60,
    content: importNoteDoc,
  },
  {
    id: 'note_html',
    courseId: 'course_web',
    title: 'HTML 常用标签',
    language: 'html',
    tags: ['HTML', '基础'],
    updatedMinutesAgo: 5 * 60,
    lastOpenedMinutesAgo: 5 * 60,
    content: htmlNoteDoc,
  },
  {
    id: 'note_box_model',
    courseId: 'course_web',
    title: 'CSS 盒模型',
    language: 'css',
    tags: ['CSS', '布局'],
    updatedMinutesAgo: 28 * 60,
    lastOpenedMinutesAgo: 28 * 60,
    content: boxModelNoteDoc,
  },
  {
    id: 'note_flex',
    courseId: 'course_web',
    title: 'Flex 布局速查',
    language: 'css',
    tags: ['CSS', '布局'],
    updatedMinutesAgo: 3 * 24 * 60,
    lastOpenedMinutesAgo: 3 * 24 * 60,
    content: flexNoteDoc,
  },
  {
    id: 'note_query_selector',
    courseId: 'course_web',
    title: '用 querySelector 取元素',
    language: 'javascript',
    tags: ['JavaScript', 'DOM'],
    updatedMinutesAgo: 5 * 24 * 60,
    content: querySelectorNoteDoc,
  },
  {
    id: 'note_class',
    courseId: 'course_java',
    title: '类与对象',
    language: 'java',
    tags: ['Java', '面向对象'],
    updatedMinutesAgo: 20 * 60,
    lastOpenedMinutesAgo: 20 * 60,
    content: classNoteDoc,
  },
  {
    id: 'note_inherit',
    courseId: 'course_java',
    title: '继承与方法重写',
    language: 'java',
    tags: ['Java', '面向对象'],
    updatedMinutesAgo: 2 * 24 * 60 + 5 * 60,
    content: inheritNoteDoc,
  },
  {
    id: 'note_interface',
    courseId: 'course_java',
    title: '接口与多态',
    language: 'java',
    tags: ['Java', '面向对象'],
    updatedMinutesAgo: 4 * 24 * 60,
    content: interfaceNoteDoc,
  },
  {
    id: 'note_array_list',
    courseId: 'course_algo',
    title: '数组与链表',
    language: 'c',
    tags: ['C', '数据结构'],
    updatedMinutesAgo: 30 * 60,
    content: arrayListNoteDoc,
  },
  {
    id: 'note_recursion',
    courseId: 'course_algo',
    title: '递归入门',
    language: 'c',
    tags: ['C', '算法'],
    favorite: true,
    updatedMinutesAgo: 25 * 60,
    lastOpenedMinutesAgo: 25 * 60,
    content: recursionNoteDoc,
  },
];

/* -------------------------------------------------------------- 复习知识点 */

const REVIEW_SEEDS: ReviewSeed[] = [
  {
    id: 'review_param_arg',
    noteId: 'note_func_args',
    title: '形参与实参的对应关系',
    summary: '定义里的 name 是形参，调用时传入的 "小林" 是实参，按位置一一对应。',
    due: 'tomorrow-9am',
    reviewCount: 1,
    state: 'scheduled',
    lastReviewedMinutesAgo: 24 * 60,
    confidence: 'medium',
  },
  {
    id: 'review_return_print',
    noteId: 'note_func_args',
    title: 'return 和 print 的区别',
    summary: 'return 把结果交还给调用者，print 只负责显示，函数没有 return 时返回 None。',
    due: 'tomorrow-9am',
    reviewCount: 0,
    state: 'scheduled',
    lastReviewedMinutesAgo: null,
    confidence: null,
  },
  {
    id: 'review_box_model',
    noteId: 'note_box_model',
    title: '盒模型里 width 到底算不算 padding',
    summary: 'content-box 下 width 只算内容区；改为 border-box 后包含 padding 与 border。',
    due: 'overdue-1-day',
    reviewCount: 2,
    state: 'due',
    lastReviewedMinutesAgo: 3 * 24 * 60,
    confidence: 'low',
  },
  {
    id: 'review_range',
    noteId: 'note_loops',
    title: 'range 的右边界不包含',
    summary: 'range(1, 5) 给出 1 到 4，想数到 5 要写 range(1, 6)。',
    due: 'overdue-2-hours',
    reviewCount: 1,
    state: 'due',
    lastReviewedMinutesAgo: 2 * 24 * 60,
    confidence: 'medium',
  },
  {
    id: 'review_dict_key',
    noteId: 'note_lists',
    title: '字典的键必须是不可变类型',
    summary: '字符串、数字、元组可以做键；列表不能做键，取值用 get() 更安全。',
    due: 'overdue-45-minutes',
    reviewCount: 0,
    state: 'due',
    lastReviewedMinutesAgo: null,
    confidence: null,
  },
  {
    id: 'review_recursion_stop',
    noteId: 'note_recursion',
    title: '递归一定要有终止条件',
    summary: '没有终止条件会一直压栈，最终栈溢出。',
    due: null,
    reviewCount: 4,
    state: 'mastered',
    lastReviewedMinutesAgo: 3 * 24 * 60,
    confidence: 'high',
  },
  {
    id: 'review_interface',
    noteId: 'note_interface',
    title: '接口和抽象类怎么选',
    summary: '需要多套实现用接口；需要共享代码和字段用抽象类。',
    due: 'in-3-days-9am',
    reviewCount: 1,
    state: 'scheduled',
    lastReviewedMinutesAgo: 4 * 24 * 60,
    confidence: 'medium',
  },
  {
    id: 'review_var_let',
    noteId: 'note_query_selector',
    title: 'const 声明的变量能不能改',
    summary: 'const 绑定不能重新赋值，但对象内部的属性可以修改。',
    due: 'in-2-days-9am',
    reviewCount: 0,
    state: 'scheduled',
    lastReviewedMinutesAgo: null,
    confidence: null,
  },
];

/* ---------------------------------------------------------------- 练习题 */

const EXERCISE_SEEDS: Array<Omit<Exercise, 'createdAt' | 'updatedAt'>> = [
  {
    id: 'exercise_add',
    title: '编写一个函数，接收两个数字并返回它们的和',
    prompt: '编写一个函数，接收两个数字并返回它们的和。',
    hint: '函数名可以叫 add，两个参数用逗号分隔，最后用 return 把结果交出去。',
    solution: ['def add(a, b):', '    return a + b', '', 'print(add(3, 5))   # 8'].join('\n'),
    language: 'python',
    difficulty: 'easy',
    done: false,
    courseId: 'course_python',
    noteId: 'note_func_args',
  },
  {
    id: 'exercise_word_count',
    title: '统计一段文本里每个单词出现的次数',
    prompt: '给定一个字符串，统计其中每个单词出现的次数，返回一个字典。',
    hint: '先用 split() 切分，再遍历，用字典累计。',
    solution: ['def count_words(text):', '    result = {}', '    for word in text.split():', '        result[word] = result.get(word, 0) + 1', '    return result'].join(
      '\n',
    ),
    language: 'python',
    difficulty: 'medium',
    done: false,
    courseId: 'course_python',
    noteId: 'note_lists',
  },
  {
    id: 'exercise_flex_three_column',
    title: '用 Flex 实现三栏布局，中间列自适应',
    prompt: '左右两栏固定 240px 和 250px，中间一栏占据剩余宽度且在窗口变窄时优先收缩。',
    hint: '固定列用 flex: 0 0 240px，中间列用 flex: 1 1 auto 并补上 min-width: 0。',
    solution: ['.main { flex: 1 1 auto; min-width: 0; }'].join('\n'),
    language: 'css',
    difficulty: 'easy',
    done: false,
    courseId: 'course_web',
    noteId: 'note_flex',
  },
  {
    id: 'exercise_to_string',
    title: '写一个 Student 类并重写 toString()',
    prompt: '类里有 name 和 age 两个私有属性，重写 toString() 返回“姓名(年龄)”。',
    hint: '构造方法里用 this.name = name，重写时加上 @Override 注解。',
    solution: ['@Override', 'public String toString() {', '    return name + "(" + age + ")";', '}'].join('\n'),
    language: 'java',
    difficulty: 'easy',
    done: true,
    courseId: 'course_java',
    noteId: 'note_inherit',
  },
  {
    id: 'exercise_recursion_sum',
    title: '用递归计算 1 到 n 的和',
    prompt: '写一个递归函数求 1 + 2 + ... + n，并说明终止条件是什么。',
    hint: 'n <= 1 时直接返回 n，否则返回 n + sum(n - 1)。',
    solution: ['int sum(int n) {', '    if (n <= 1) return n;', '    return n + sum(n - 1);', '}'].join('\n'),
    language: 'c',
    difficulty: 'medium',
    done: false,
    courseId: 'course_algo',
    noteId: 'note_recursion',
  },
];

/* -------------------------------------------------------------- 代码片段 */

const SNIPPET_SEEDS: Array<Omit<CodeSnippet, 'createdAt' | 'updatedAt'>> = [
  {
    id: 'snippet_fstring',
    title: '用 f-string 拼接字符串',
    language: 'python',
    code: ['name = "小林"', 'score = 92', 'print(f"{name} 的成绩是 {score} 分")'].join('\n'),
    description: '在字符串前面加 f，花括号里可以直接写变量或表达式。',
    output: '小林 的成绩是 92 分',
    courseId: 'course_python',
    noteId: 'note_variables',
  },
  {
    id: 'snippet_dedupe',
    title: '数组去重（保留顺序）',
    language: 'javascript',
    code: 'const unique = [...new Set([1, 2, 2, 3, 1])];\nconsole.log(unique);',
    description: 'Set 会自动去重，配合展开运算符就能变回数组。',
    output: '[1, 2, 3]',
    courseId: 'course_web',
    noteId: null,
  },
  {
    id: 'snippet_swap',
    title: '交换两个变量的值',
    language: 'c',
    code: ['int a = 1, b = 2;', 'int temp = a;', 'a = b;', 'b = temp;'].join('\n'),
    description: 'C 语言没有元组赋值，需要借助临时变量。',
    output: null,
    courseId: 'course_algo',
    noteId: null,
  },
];

/* ---------------------------------------------------------------- 组装 */

function shift(now: Date, minutesAgo: number): string {
  return new Date(now.getTime() - minutesAgo * MINUTE).toISOString();
}

export function createSeedData(now: Date = new Date()): SeedData {
  const courses = SEED_COURSES.map((course, index) => ({
    ...course,
    createdAt: shift(now, (30 - index) * 24 * 60),
    updatedAt: shift(now, 60),
  }));

  const notes: Note[] = NOTE_SEEDS.map((seed) => {
    const plain = docToPlainText(seed.content);
    return {
      id: seed.id,
      courseId: seed.courseId,
      title: seed.title,
      contentJson: JSON.stringify(seed.content),
      contentText: plain,
      excerpt: noteExcerpt(seed.content, plain),
      language: seed.language,
      tags: seed.tags,
      favorite: seed.favorite ?? false,
      archived: false,
      createdAt: shift(now, seed.updatedMinutesAgo + 90),
      updatedAt: shift(now, seed.updatedMinutesAgo),
      lastOpenedAt:
        seed.lastOpenedMinutesAgo === undefined ? null : shift(now, seed.lastOpenedMinutesAgo),
    };
  });

  const reviewItems: ReviewItem[] = REVIEW_SEEDS.map((seed) => ({
    id: seed.id,
    title: seed.title,
    summary: seed.summary,
    noteId: seed.noteId,
    courseId: notes.find((note) => note.id === seed.noteId)?.courseId ?? 'course_python',
    state: seed.state,
    dueAt: resolveDuePreset(seed.due, now),
    lastReviewedAt:
      seed.lastReviewedMinutesAgo === null ? null : shift(now, seed.lastReviewedMinutesAgo),
    reviewCount: seed.reviewCount,
    masteredStreak: seed.state === 'mastered' ? MASTERED_AFTER : seed.confidence === 'high' ? 1 : 0,
    confidence: seed.confidence,
    createdAt: shift(now, 10 * 24 * 60),
    updatedAt: shift(now, seed.lastReviewedMinutesAgo ?? 10 * 24 * 60),
  }));

  const exercises: Exercise[] = EXERCISE_SEEDS.map((seed) => ({
    ...seed,
    createdAt: shift(now, 3 * 24 * 60),
    updatedAt: shift(now, 24 * 60),
  }));

  const snippets: CodeSnippet[] = SNIPPET_SEEDS.map((seed) => ({
    ...seed,
    createdAt: shift(now, 5 * 24 * 60),
    updatedAt: shift(now, 2 * 24 * 60),
  }));

  const settings: UserSettings = {
    ...DEFAULT_SETTINGS,
    lastOpenedNoteId: 'note_func_args',
    recentNoteIds: [
      'note_func_args',
      'note_html',
      'note_class',
      'note_recursion',
      'note_box_model',
      'note_loops',
    ],
  };

  return { courses, notes, snippets, exercises, reviewItems, settings };
}

/** 用于搜索的代码文本：把 CodeSnippet 也拼进可检索文本 */
export function snippetSearchText(snippet: CodeSnippet): string {
  return `${snippet.title} ${snippet.description} ${snippet.code}`;
}
