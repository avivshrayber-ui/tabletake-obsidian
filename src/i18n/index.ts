import { moment } from 'obsidian';
import { en, type Messages } from './en';
import de from './de';
import ja from './ja';
import fr from './fr';
import es from './es';
import pt_BR from './pt-BR';
import ko from './ko';
import it from './it';
import nl from './nl';
import tr from './tr';
import ru from './ru';
import zh_CN from './zh-CN';
import zh_TW from './zh-TW';
import pl from './pl';
import sv from './sv';
import da from './da';
import nb from './nb';
import fi from './fi';
import id from './id';
import ar from './ar';
import he from './he';
const locales: Record<string, Partial<Messages>> = {
  'de': de, 
  'ja': ja, 
  'fr': fr, 
  'es': es, 
  'pt-BR': pt_BR, 
  'ko': ko, 
  'it': it, 
  'nl': nl, 
  'tr': tr, 
  'ru': ru, 
  'zh-CN': zh_CN, 
  'zh-TW': zh_TW, 
  'pl': pl, 
  'sv': sv, 
  'da': da, 
  'nb': nb, 
  'fi': fi, 
  'id': id, 
  'ar': ar, 
  'he': he, 
};
export function language(): string {
  let selected: string | null = null;
  try { selected = window.localStorage.getItem('language'); } catch { /* Restricted storage. */ }
  const raw = (selected || moment.locale() || 'en').replace('_', '-').toLowerCase();
  return Object.keys(locales).find(key => key.toLowerCase() === raw) ??
    Object.keys(locales).find(key => key.toLowerCase() === raw.split('-')[0]) ?? 'en';
}
export function isRtl(): boolean { return ['ar', 'he'].includes(language()); }
export function t(key: keyof Messages, vars: Record<string, string | number> = {}): string {
  return (locales[language()]?.[key] ?? en[key]).replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match));
}
