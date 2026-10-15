import MarkdownIt from 'markdown-it';
import {codeBlock,type Doc,type DocNode,type DocMark} from './noteDoc';
import type {LanguageId} from './types';

const parser=new MarkdownIt({html:false,linkify:false,typographer:false});
type Token=ReturnType<typeof parser.parse>[number];
function inline(tokens:Token[]):DocNode[]{
 const result:DocNode[]=[],marks:Array<{kind:string;mark:DocMark}>=[];
 for(const token of tokens){
  const kind=token.type.replace(/_(open|close)$/,'');
  const markType:Record<string,string>={strong:'bold',em:'italic',s:'strike',link:'link'};
  if(token.nesting===1&&markType[kind]){
   const href=String(token.attrGet('href')??'');
   const allowed=kind!=='link'||/^(https?:|mailto:|#|\/(?!\/))/i.test(href);
   if(allowed)marks.push({kind,mark:{type:markType[kind]!,...(kind==='link'?{attrs:{href}}:{})}});
  }else if(token.nesting===-1&&markType[kind]){const index=marks.map(m=>m.kind).lastIndexOf(kind);if(index>=0)marks.splice(index,1);}
  else if(token.type==='hardbreak')result.push({type:'hardBreak'});
  else if(['text','code_inline','softbreak','image'].includes(token.type)){
   const value=token.type==='softbreak'?' ':token.content;if(!value)continue;
   const active=token.type==='code_inline'?[{type:'code'}]:marks.map(m=>m.mark);
   result.push({type:'text',text:value,...(active.length?{marks:active}:{})});
  }
 }
 return result;
}
function language(info:string):LanguageId{
 const aliases:Record<string,LanguageId>={js:'javascript',ts:'typescript',py:'python',javascript:'javascript',typescript:'typescript',python:'python',html:'html',css:'css',java:'java',c:'c',text:'text',plaintext:'text'};
 return aliases[info.trim().split(/\s/)[0]?.toLowerCase()??'']??'text';
}
/** Parse tokens directly into the editor schema. No HTML rendering or DOM insertion. */
export function markdownToDoc(markdown:string):Doc{
 const envelope=/^(`{3,}|~{3,})(?:markdown|md)\s*\r?\n([\s\S]*?)\r?\n\1\s*$/i.exec(markdown.trim());
 const tokens=parser.parse(envelope?.[2]??markdown,{}),root:Doc={type:'doc',content:[]};
 const stack:Array<{kind:string;node:DocNode|Doc}>=[{kind:'root',node:root}];
 const append=(node:DocNode)=>stack.at(-1)!.node.content!.push(node);
 const types:Record<string,string>={paragraph:'paragraph',heading:'heading',bullet_list:'bulletList',ordered_list:'orderedList',list_item:'listItem',blockquote:'blockquote',table:'table',tr:'tableRow',th:'tableHeader',td:'tableCell'};
 for(const token of tokens){
  const kind=token.type.replace(/_(open|close)$/,'');
  if(token.nesting===1&&types[kind]){
   const attrs=kind==='heading'?{level:Math.min(3,Number(token.tag.slice(1)))}:kind==='ordered_list'?{start:Math.max(1,Number(token.attrGet('start')??1))}:['th','td'].includes(kind)?{colspan:1,rowspan:1,colwidth:null}:undefined;
   const node:DocNode={type:types[kind]!,...(attrs?{attrs}:{}),content:[]};append(node);stack.push({kind,node});
  }else if(token.nesting===-1&&types[kind]){if(stack.at(-1)?.kind===kind){const node=stack.at(-1)!.node;if(['th','td'].includes(kind))node.content=[{type:'paragraph',content:node.content??[]}];if(kind==='list_item'&&node.content?.[0]?.type!=='paragraph')node.content=[{type:'paragraph'},...(node.content??[])];if(kind==='blockquote'&&!node.content?.length)node.content=[{type:'paragraph'}];stack.pop();}}
  else if(token.type==='inline')stack.at(-1)!.node.content!.push(...inline(token.children??[]));
  else if(token.type==='fence'||token.type==='code_block')append(codeBlock(language(token.info),token.content.replace(/\n$/,'')));
  else if(token.type==='hr')append({type:'horizontalRule'});
 }
 if(!root.content.length)root.content.push({type:'paragraph'});
 return root;
}
