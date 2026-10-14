import {expect,it} from 'vitest';
import {localModelName,recommendModels} from './localAI';
it('recommends modest quantized text models for a 16GB/4GB laptop',()=>{
 const choices=recommendModels({cpu:'i5',ramGB:16,freeGB:8,gpu:'3050',vramGB:4,diskFreeGB:20});
 expect(choices[0]!.name).toBe('qwen3:4b-instruct-2507-q4_K_M');expect(choices.every(c=>c.sizeGB<4)).toBe(true);
});
it.each(['../secret','model\nFROM x','x cloud','qwen:cloud','user/model-cloud'])('rejects unsafe or cloud model %s',v=>expect(()=>localModelName(v)).toThrow());
