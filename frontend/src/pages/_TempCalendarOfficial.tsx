// TEMPORARY — official shadcn Popover + Calendar, zero project wrappers, zero
// extra CSS, zero logic. For visual comparison only. Delete after review.
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';

export default function TempCalendarOfficial() {
  return (
    <Popover>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar captionLayout="dropdown" />
      </PopoverContent>
    </Popover>
  );
}
