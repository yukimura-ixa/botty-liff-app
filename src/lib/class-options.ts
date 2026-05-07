export const GRADE_LEVELS = ['1', '2', '3', '4', '5', '6']
export const ROOM_LEVELS = ['1', '2', '3']

export const CLASS_KEY_OPTIONS = GRADE_LEVELS.flatMap(grade =>
    ROOM_LEVELS.map(room => `${grade}/${room}`)
)
