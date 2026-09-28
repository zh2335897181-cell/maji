import { useState, type ReactElement } from 'react';
import { useLibrary } from '../../app/LibraryProvider';
import { useToast } from '../../app/ToastProvider';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import {
  COURSE_COLOR_KEYS,
  COURSE_COLOR_LABELS,
  COURSE_ICON_KEYS,
  courseColorVar,
  courseIcon,
} from '../../lib/icons';
import { LANGUAGE_OPTIONS } from '../../lib/languages';
import type { Course, CourseColorKey, LanguageId } from '../../lib/types';
import styles from './courses.module.css';

export interface CourseEditorDialogProps {
  open: boolean;
  /** 传入课程表示编辑，传 null 表示新建 */
  course: Course | null;
  onClose(): void;
  onSaved?(course: Course): void;
}

/** 新建 / 编辑课程：名称、说明、主语言、颜色、图标 */
export function CourseEditorDialog({
  open,
  course,
  onClose,
  onSaved,
}: CourseEditorDialogProps): ReactElement {
  const { createCourse, updateCourse } = useLibrary();
  const toast = useToast();

  const [name, setName] = useState(course?.name ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const [language, setLanguage] = useState<LanguageId>(course?.language ?? 'python');
  const [colorKey, setColorKey] = useState<CourseColorKey>(course?.colorKey ?? 'teal');
  const [iconKey, setIconKey] = useState(course?.iconKey ?? 'book');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 每次打开（或切换课程）时同步表单内容：这是 React 推荐的“随 props 调整 state”写法，
  // 用上一次的标识做守卫，避免重复渲染。
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  const syncKey = open ? (course?.id ?? 'new') : null;
  if (syncKey !== syncedFor) {
    setSyncedFor(syncKey);
    if (syncKey !== null) {
      setName(course?.name ?? '');
      setDescription(course?.description ?? '');
      setLanguage(course?.language ?? 'python');
      setColorKey(course?.colorKey ?? 'teal');
      setIconKey(course?.iconKey ?? 'book');
      setError(null);
    }
  }

  const Icon = courseIcon(iconKey);

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('请填写课程名称，例如「Python 入门」');
      return;
    }
    if (trimmed.length > 40) {
      setError('课程名称不能超过 40 个字符');
      return;
    }
    setBusy(true);
    try {
      const saved = course
        ? await updateCourse(course.id, { name: trimmed, description, language, colorKey, iconKey })
        : await createCourse({ name: trimmed, description, language, colorKey, iconKey });
      toast.show(course ? '课程信息已更新' : `已创建课程「${saved.name}」`);
      onSaved?.(saved);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={course ? '编辑课程' : '新建课程'}
      description={
        course
          ? '修改后立即生效，已有笔记不会受影响。'
          : '课程是笔记的第一层分类，建议按「语言 + 阶段」命名。'
      }
      icon={Icon}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            {course ? '保存修改' : '创建课程'}
          </Button>
        </>
      }
    >
      <div className={styles.courseForm}>
        <div className={styles.coursePreview}>
          <span
            className={styles.coursePreviewIcon}
            style={{
              background: courseColorVar(colorKey, 'bg'),
              color: courseColorVar(colorKey, 'fg'),
            }}
          >
            <Icon size={14} aria-hidden />
          </span>
          {name.trim() || '课程名称预览'}
        </div>

        <TextField
          label="课程名称"
          required
          hint="必填"
          example="Python 入门"
          value={name}
          error={error}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />

        <TextField
          label="一句话说明"
          hint="选填，会显示在课程卡片上"
          example="第 3 周 · 函数与模块"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <div className={styles.courseForm}>
          <SelectField
            label="主要编程语言"
            hint="新建笔记时会作为默认语言"
            value={language}
            options={LANGUAGE_OPTIONS}
            onChange={(event) => setLanguage(event.target.value as LanguageId)}
          />
        </div>

        <div>
          <span className="visually-hidden">课程颜色</span>
          <div className={styles.swatchRow} role="group" aria-label="课程颜色">
            {COURSE_COLOR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={styles.swatch}
                aria-pressed={colorKey === key}
                aria-label={`颜色 ${COURSE_COLOR_LABELS[key] ?? key}`}
                title={COURSE_COLOR_LABELS[key] ?? key}
                onClick={() => setColorKey(key)}
              >
                <span
                  className={styles.colorChip}
                  style={{ background: courseColorVar(key, 'bg'), borderColor: courseColorVar(key, 'border') }}
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="visually-hidden">课程图标</span>
          <div className={styles.swatchRow} role="group" aria-label="课程图标">
            {COURSE_ICON_KEYS.map((key) => {
              const OptionIcon = courseIcon(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.swatch}
                  aria-pressed={iconKey === key}
                  aria-label={`图标 ${key}`}
                  onClick={() => setIconKey(key)}
                >
                  <OptionIcon size={15} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
