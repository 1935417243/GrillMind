// 简历操作 Hook
import { useState, useEffect, useCallback, useRef } from 'react';
import { resumeApi } from '../api/client';
import { useAppDispatch } from '../store/AppContext';

// 轮询间隔（毫秒）
const POLL_INTERVAL = 3000;

/**
 * 简历管理 Hook
 * - 自动轮询解析状态，解析完成后停止轮询
 */
export function useResume() {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();
  const pollTimerRef = useRef(null);

  // 加载简历列表
  const loadResumes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await resumeApi.list();
      setResumes(data);
      dispatch({ type: 'SET_RESUMES', payload: data });

      // 找出当前激活的简历
      const active = data.find(r => r.isActive);
      if (active) {
        dispatch({ type: 'SET_ACTIVE_RESUME', payload: active });
      }

      return data;
    } catch (err) {
      console.error('加载简历失败:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  // 上传简历
  const uploadResume = useCallback(async (file) => {
    const result = await resumeApi.upload(file);
    await loadResumes();
    return result;
  }, [loadResumes]);

  // 激活简历
  const activateResume = useCallback(async (id) => {
    await resumeApi.activate(id);
    await loadResumes();
  }, [loadResumes]);

  // 删除简历（可能返回 409 表示有关联面试记录）
  const deleteResume = useCallback(async (id) => {
    await resumeApi.delete(id);
    await loadResumes();
  }, [loadResumes]);

  // 强制删除简历（级联删除关联的面试记录和报告）
  const forceDeleteResume = useCallback(async (id) => {
    await resumeApi.forceDelete(id);
    await loadResumes();
  }, [loadResumes]);

  // 获取简历完整详情（含 parsed 数据）
  const getResumeDetail = useCallback(async (id) => {
    return await resumeApi.get(id);
  }, []);

  // 重新解析简历
  const reparseResume = useCallback(async (id) => {
    await resumeApi.reparse(id);
    await loadResumes();
  }, [loadResumes]);

  // 轮询逻辑：当有 pending/processing 状态的简历时，定时刷新列表
  useEffect(() => {
    const hasPending = resumes.some(
      r => r.parseStatus === 'pending' || r.parseStatus === 'processing'
    );

    // 清除旧定时器
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    // 存在未完成解析的简历时，启动轮询
    if (hasPending) {
      pollTimerRef.current = setInterval(async () => {
        try {
          const data = await resumeApi.list();
          setResumes(data);
          dispatch({ type: 'SET_RESUMES', payload: data });

          const active = data.find(r => r.isActive);
          if (active) {
            dispatch({ type: 'SET_ACTIVE_RESUME', payload: active });
          }

          // 全部解析完成后停止轮询
          const stillPending = data.some(
            r => r.parseStatus === 'pending' || r.parseStatus === 'processing'
          );
          if (!stillPending && pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        } catch (err) {
          console.error('轮询简历状态失败:', err);
        }
      }, POLL_INTERVAL);
    }

    // 组件卸载时清除定时器
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [resumes, dispatch]);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  return { resumes, loading, uploadResume, activateResume, deleteResume, forceDeleteResume, loadResumes, getResumeDetail, reparseResume };
}
