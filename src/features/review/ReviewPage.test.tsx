import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewPage } from './ReviewPage';
import { ReviewSessionRunner } from './ReviewSessionRunner';
import { ReviewSessionHistory } from './ReviewSessionHistory';

const mocks = vi.hoisted(() => ({
  toast: { show: vi.fn() },
  library: {
    value: {} as Record<string, unknown>,
    loadNote: vi.fn(),
    createReviewSession: vi.fn(),
    updateReviewSession: vi.fn(),
    saveReviewAnswer: vi.fn(),
    saveReviewGrade: vi.fn(),
    getReviewSession: vi.fn(),
    applyReviewAction: vi.fn(),
  },
  ai: {
    getSettings: vi.fn(),
    review: { generate: vi.fn(), grade: vi.fn() },
  },
}));

vi.mock('../../app/LibraryProvider', () => ({ useLibrary: () => mocks.library.value }));
vi.mock('../../app/ToastProvider', () => ({ useToast: () => mocks.toast }));

const review = {
  id: 'review_greet', title: '函数参数', summary: '参数接收外部数据。', noteId: 'note_func_args', courseId: 'course_python',
  noteTitle: '函数与参数', courseName: 'Python 入门', courseColorKey: 'teal', state: 'due', dueAt: null,
  lastReviewedAt: null, reviewCount: 0, masteredStreak: 0, confidence: null,
  createdAt: '2025-03-04T09:00:00.000Z', updatedAt: '2025-03-04T09:00:00.000Z',
};
const note = {
  id: 'note_func_args', courseId: 'course_python', title: '函数与参数', contentJson: '{}',
  contentText: '函数可以接收参数，并返回结果。', excerpt: '函数可以接收参数。', language: 'python', tags: [], favorite: false,
  archived: false, createdAt: review.createdAt, updatedAt: review.updatedAt, lastOpenedAt: null,
};
const generatedQuestion = {
  type: 'code-writing', difficulty: 'easy', title: '编写 greet', prompt: '写一个接收 name 的函数。',
  hint: '使用参数。', referenceAnswer: 'def greet(name): return name', explanation: '参数让函数可以处理不同姓名。',
  language: 'python', sourceNoteId: 'note_func_args',
};
const session = {
  id: 'review_session_1', scope: 'due', status: 'in-progress', depth: 'standard', plannedQuestionCount: 1,
  sources: [], startedAt: '2025-03-04T09:00:00.000Z', endedAt: null, durationSeconds: 0, activeSegments: [],
  activeSegmentStartedAt: '2025-03-04T09:00:00.000Z', createdAt: '2025-03-04T09:00:00.000Z', updatedAt: '2025-03-04T09:00:00.000Z',
  questionCount: 1, averageScore: null, questions: [{ ...generatedQuestion, id: 'review_question_1', sessionId: 'review_session_1', order: 1, answer: null, grade: null, answeredAt: null, gradedAt: null }],
};

function renderPage() {
  return render(<MemoryRouter><ReviewPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.library.value = {
    reviews: [review], notes: [{ ...note, contentJson: undefined, contentText: undefined, courseName: 'Python 入门', courseColorKey: 'teal' }],
    courses: [{ id: 'course_python', name: 'Python 入门', language: 'python', colorKey: 'teal' }],
    reviewSessions: [], loadNote: mocks.library.loadNote, createReviewSession: mocks.library.createReviewSession,
    updateReviewSession: mocks.library.updateReviewSession, saveReviewAnswer: mocks.library.saveReviewAnswer,
    saveReviewGrade: mocks.library.saveReviewGrade, getReviewSession: mocks.library.getReviewSession,
    applyReviewAction: mocks.library.applyReviewAction,
  };
  mocks.library.loadNote.mockResolvedValue(note);
  mocks.library.createReviewSession.mockResolvedValue({ ...session, sources: [{ noteId: note.id, noteTitle: note.title, courseName: 'Python 入门', contentExcerpt: note.contentText, reviewItemIds: [review.id] }] });
  mocks.library.updateReviewSession.mockResolvedValue(session);
  mocks.ai.getSettings.mockResolvedValue({ configured: true, keyPresent: true, baseUrl: 'https://api.example/v1', model: 'demo' });
  mocks.ai.review.generate.mockResolvedValue([generatedQuestion]);
  Object.defineProperty(window, 'maji', {
    configurable: true,
    value: { ai: mocks.ai, app: { onPrepareClose: vi.fn(() => vi.fn()) } },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'maji', { configurable: true, value: undefined });
});

describe('AI review setup', () => {
  it('saves a pending answer without invoking AI before backup', async () => {
    const user = userEvent.setup();
    mocks.library.saveReviewAnswer.mockResolvedValue({ ...session.questions[0], answer: '我的答案' });
    render(<ReviewSessionRunner session={session as never} onBack={() => {}} />);
    await user.type(screen.getByRole('textbox'), '我的答案');
    const callback = vi.mocked(window.maji!.app.onPrepareClose).mock.calls.at(-1)![0];
    await callback();
    expect(mocks.library.saveReviewAnswer).toHaveBeenCalledWith(session.id, { questionId: session.questions[0].id, answer: '我的答案' });
    expect(mocks.ai.review.grade).not.toHaveBeenCalled();
  });
  it('propagates pending review save failures to the backup coordinator', async () => {
    render(<ReviewSessionRunner session={session as never} onBack={() => {}} />);
    await waitFor(() => expect(window.maji!.app.onPrepareClose).toHaveBeenCalled());
    mocks.library.updateReviewSession.mockRejectedValue(new Error('计时保存失败'));
    const callback = vi.mocked(window.maji!.app.onPrepareClose).mock.calls.at(-1)![0];
    await expect(callback()).rejects.toThrow('计时保存失败');
  });
  it('shows the selected note before sending it and generates only after explicit confirmation', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'AI 每日练习' }));
    await user.click(screen.getByRole('button', { name: '预览将发送内容' }));
    expect(await screen.findByText('函数可以接收参数，并返回结果。')).toBeInTheDocument();
    expect(mocks.ai.review.generate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '确认并生成练习' }));
    await waitFor(() => expect(mocks.ai.review.generate).toHaveBeenCalledOnce());
    expect(mocks.library.createReviewSession).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'due', depth: 'standard', plannedQuestionCount: 5,
      sources: [expect.objectContaining({ noteId: 'note_func_args', reviewItemIds: ['review_greet'] })],
    }));
    expect(await screen.findByText('编写 greet')).toBeInTheDocument();
  });

  it('routes an unconfigured desktop AI service to AI settings', async () => {
    const user = userEvent.setup();
    mocks.ai.getSettings.mockResolvedValueOnce({ configured: false, keyPresent: false, baseUrl: '', model: '' });
    const openSettings = vi.fn();
    window.addEventListener('maji:open-ai-settings', openSettings);
    renderPage();
    await user.click(screen.getByRole('button', { name: 'AI 每日练习' }));
    await user.click(await screen.findByRole('button', { name: '配置 AI 服务' }));
    expect(openSettings).toHaveBeenCalledOnce();
    expect(mocks.ai.review.generate).not.toHaveBeenCalled();
    window.removeEventListener('maji:open-ai-settings', openSettings);
  });

  it('keeps setup open and shows a retryable error when question generation fails', async () => {
    const user = userEvent.setup();
    mocks.ai.review.generate.mockRejectedValueOnce(new Error('AI 服务暂时不可用'));
    renderPage();
    await user.click(screen.getByRole('button', { name: 'AI 每日练习' }));
    await user.click(screen.getByRole('button', { name: '预览将发送内容' }));
    await user.click(screen.getByRole('button', { name: '确认并生成练习' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI 服务暂时不可用');
    expect(mocks.library.createReviewSession).not.toHaveBeenCalled();
  });
});

describe('AI review runner', () => {
  it('resumes an unfinished session from its last saved heartbeat without counting downtime', async () => {
    render(<MemoryRouter><ReviewSessionRunner session={session as never} onBack={vi.fn()} /></MemoryRouter>);
    await waitFor(() => expect(mocks.library.updateReviewSession).toHaveBeenCalledWith(
      session.id,
      expect.objectContaining({ activeSegments: [], activeSegmentStartedAt: expect.any(String) }),
    ));
  });

  it('saves an answer before AI grading and keeps it when grading fails so the user can retry', async () => {
    const user = userEvent.setup();
    const question = session.questions[0]!;
    mocks.library.saveReviewAnswer.mockResolvedValue({ ...question, answer: 'def greet(name): return name', answeredAt: new Date().toISOString() });
    mocks.library.saveReviewGrade.mockResolvedValue({ ...question, answer: 'def greet(name): return name', grade: { score: 80, rationale: '思路正确。', omissions: [], feedback: '很好。', referenceAnswer: question.referenceAnswer, explanation: question.explanation } });
    mocks.ai.review.grade.mockRejectedValueOnce(new Error('AI 服务暂时不可用')).mockResolvedValueOnce({
      score: 80, rationale: '思路正确。', omissions: [], feedback: '很好。', referenceAnswer: question.referenceAnswer, explanation: question.explanation,
    });
    render(<MemoryRouter><ReviewSessionRunner session={session as never} onBack={vi.fn()} /></MemoryRouter>);
    await user.type(screen.getByLabelText('你的答案'), 'def greet(name): return name');
    await user.click(screen.getByRole('button', { name: '提交答案并查看解析' }));
    expect(mocks.library.saveReviewAnswer.mock.invocationCallOrder[0]).toBeLessThan(mocks.ai.review.grade.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER);
    expect(await screen.findByRole('alert')).toHaveTextContent('AI 服务暂时不可用');
    expect(mocks.library.saveReviewAnswer).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '重试 AI 评阅' }));
    expect(await screen.findByText('80 分')).toBeInTheDocument();
    expect(mocks.library.saveReviewGrade).toHaveBeenCalledOnce();
  });

  it('does not change spaced-repetition state until the user confirms a result', async () => {
    const user = userEvent.setup();
    const completeSession = {
      ...session,
      activeSegmentStartedAt: null,
      sources: [{ noteId: note.id, noteTitle: note.title, courseName: 'Python 入门', contentExcerpt: note.contentText, reviewItemIds: [review.id] }],
      questions: [{ ...session.questions[0]!, answer: '答案', grade: { score: 100, rationale: '完整。', omissions: [], feedback: '不错。', referenceAnswer: '答案', explanation: '解析。' } }],
    };
    mocks.library.updateReviewSession.mockResolvedValue({ ...completeSession, status: 'completed', endedAt: new Date().toISOString() });
    render(<MemoryRouter><ReviewSessionRunner session={completeSession as never} onBack={vi.fn()} /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '完成本次练习' }));
    expect(await screen.findByRole('heading', { name: '本次练习已完成' })).toBeInTheDocument();
    expect(mocks.library.applyReviewAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '标记关联知识点为已掌握' }));
    expect(mocks.library.applyReviewAction).toHaveBeenCalledWith('review_greet', 'mastered');
  });
});

describe('AI review history', () => {
  it('groups active time by local day and opens a saved session', async () => {
    const user = userEvent.setup();
    const opened = vi.fn();
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 60_000);
    render(<ReviewSessionHistory sessions={[{
      ...session,
      status: 'completed',
      activeSegmentStartedAt: null,
      activeSegments: [{ startedAt: start.toISOString(), endedAt: end.toISOString() }],
      sources: [{ noteId: note.id, noteTitle: note.title, courseName: 'Python 入门', contentExcerpt: note.contentText, reviewItemIds: [review.id] }],
      questionCount: 1,
      averageScore: 80,
    }] as never} onBack={vi.fn()} onOpen={opened} />);
    expect(await screen.findByText('7 分钟')).toBeInTheDocument();
    expect(screen.getByText('函数与参数')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看详情' }));
    expect(opened).toHaveBeenCalledWith(session.id);
  });

  it('does not count time after the last heartbeat for an abandoned open session', async () => {
    const start = new Date(Date.now() - 30 * 60_000);
    const heartbeat = new Date(Date.now() - 5 * 60_000);
    render(<ReviewSessionHistory sessions={[{
      ...session,
      activeSegments: [],
      activeSegmentStartedAt: start.toISOString(),
      updatedAt: heartbeat.toISOString(),
      sources: [{ noteId: note.id, noteTitle: note.title, courseName: 'Python 入门', contentExcerpt: note.contentText, reviewItemIds: [review.id] }],
      questionCount: 1,
      averageScore: null,
    }] as never} onBack={vi.fn()} onOpen={vi.fn()} />);
    expect(await screen.findByText('25 分钟')).toBeInTheDocument();
  });
});
