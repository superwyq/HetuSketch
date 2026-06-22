import { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';
import type { AiStreamChunk, AiValidationRequest, RagQueryRequest, ValidationFinding, ValidationResult } from '@shared/storageTypes';

export function useAiAssistantStreams(projectId: string, selectedText: string): {
  validationText: string;
  setValidationText: React.Dispatch<React.SetStateAction<string>>;
  validationOutput: string;
  validationFindings: ValidationFinding[];
  validationLoading: boolean;
  foreshadowingText: string;
  setForeshadowingText: React.Dispatch<React.SetStateAction<string>>;
  foreshadowingOutput: string;
  foreshadowingReminders: ValidationFinding[];
  foreshadowingLoading: boolean;
  ragQuery: string;
  setRagQuery: React.Dispatch<React.SetStateAction<string>>;
  ragOutput: string;
  ragLoading: boolean;
  runValidation: () => Promise<void>;
  runForeshadowing: () => Promise<void>;
  runRag: () => Promise<void>;
} {
  const [validationText, setValidationText] = useState('');
  const [validationOutput, setValidationOutput] = useState('');
  const [validationFindings, setValidationFindings] = useState<ValidationFinding[]>([]);
  const [validationLoading, setValidationLoading] = useState(false);
  const [foreshadowingText, setForeshadowingText] = useState('');
  const [foreshadowingOutput, setForeshadowingOutput] = useState('');
  const [foreshadowingReminders, setForeshadowingReminders] = useState<ValidationFinding[]>([]);
  const [foreshadowingLoading, setForeshadowingLoading] = useState(false);
  const [ragQuery, setRagQuery] = useState('');
  const [ragOutput, setRagOutput] = useState('');
  const [ragLoading, setRagLoading] = useState(false);

  useEffect(() => {
    if (selectedText) {
      setValidationText(selectedText);
      setForeshadowingText(selectedText);
    }
  }, [selectedText]);

  const runValidation = useCallback(async (): Promise<void> => {
    if (!validationText.trim()) {
      message.warning('请输入待校验文本');
      return;
    }
    setValidationLoading(true);
    setValidationOutput('');
    setValidationFindings([]);
    const request: AiValidationRequest = {
      projectId,
      text: validationText,
      includePlotReminders: true,
      retrievalMode: 'hybrid',
      topK: 5
    };
    const basic: ValidationResult = {
      ok: true,
      checkedAt: new Date().toISOString(),
      summary: {
        checkedCharacters: 0,
        checkedWorldRules: 0,
        checkedOpenPlots: 0,
        warningCount: 0,
        reminderCount: 0
      },
      findings: []
    };
    try {
      await window.hetuSketch.ai.streamValidation(request, basic, (chunk: AiStreamChunk) => {
        if (chunk.type === 'delta' && chunk.content) {
          setValidationOutput((prev) => prev + chunk.content);
        } else if (chunk.type === 'error') {
          message.error(chunk.error ?? 'AI 校验出错');
        }
      });
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : 'AI 校验失败');
    } finally {
      setValidationLoading(false);
    }
  }, [projectId, validationText]);

  const runForeshadowing = useCallback(async (): Promise<void> => {
    if (!foreshadowingText.trim()) {
      message.warning('请输入待分析文本');
      return;
    }
    setForeshadowingLoading(true);
    setForeshadowingOutput('');
    setForeshadowingReminders([]);
    try {
      await window.hetuSketch.ai.streamForeshadowing(projectId, foreshadowingText, (chunk: AiStreamChunk) => {
        if (chunk.type === 'delta' && chunk.content) {
          setForeshadowingOutput((prev) => prev + chunk.content);
        } else if (chunk.type === 'error') {
          message.error(chunk.error ?? '伏笔分析出错');
        }
      });
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '伏笔分析失败');
    } finally {
      setForeshadowingLoading(false);
    }
  }, [foreshadowingText, projectId]);

  const runRag = useCallback(async (): Promise<void> => {
    if (!ragQuery.trim()) {
      message.warning('请输入问题');
      return;
    }
    setRagLoading(true);
    setRagOutput('');
    const request: RagQueryRequest = {
      projectId,
      query: ragQuery,
      topK: 5,
      retrievalMode: 'hybrid'
    };
    try {
      await window.hetuSketch.ai.streamRagAnswer(request, (chunk: AiStreamChunk) => {
        if (chunk.type === 'delta' && chunk.content) {
          setRagOutput((prev) => prev + chunk.content);
        } else if (chunk.type === 'error') {
          message.error(chunk.error ?? 'RAG 问答出错');
        }
      });
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : 'RAG 问答失败');
    } finally {
      setRagLoading(false);
    }
  }, [projectId, ragQuery]);

  return {
    validationText,
    setValidationText,
    validationOutput,
    validationFindings,
    validationLoading,
    foreshadowingText,
    setForeshadowingText,
    foreshadowingOutput,
    foreshadowingReminders,
    foreshadowingLoading,
    ragQuery,
    setRagQuery,
    ragOutput,
    ragLoading,
    runValidation,
    runForeshadowing,
    runRag
  };
}
