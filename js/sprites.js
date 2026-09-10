"use strict";
/* =========================================================================
   Sprites Mario — thème visuel du jeu. Images encodées en base64 pour que
   le fichier reste autoportant (standalone) ; ce sont les mêmes images
   que project/assets/*.png dans le projet complet.
   ========================================================================= */

const SPRITE_BLOCK_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABOSURBVDhPY5jrzfh/jhcDVszIwPB/NhZxZHmGgTeAkZHxPwOIQS5GdgFIgJCN6PKDwACqhgE6xmYjuvwgMICqYQASIGQjuvwgMIDSMAAAD6yWMHqxvXUAAAAASUVORK5CYII=";

const MARIO_SPRITE_SRC = {
  idleL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAdCAYAAACjbey/AAABGElEQVR4nJWVu7nCMAyFJb4M4TWcLinvGLRpGYc2bca4JenIGt5CFGAj64GdUyUi5/ex/ABBiGIgWcMjoaxlXVRl+VMlioEssA1wIG467wdPcjoDL9L9WkD7scEUr+W56KiBgzQqw0cZ9lg2mlcoKQZp5h97MC7VxJbhnQLKoCgLXhI5QJ6GvYyd5pIAQDfSMnOjAnBVsPX/CxmTgrh7/LEATc8A+5hKLb9ziNkDy+zJBLTMfNUUgGKgX+bpGar3oRg/jfM2kjRWCVpLKFU1scfsjQ7ApnDWqAB425BioAnaJi61kXpuJ34ruYfJ0z4mfZzPpJB7xEyAR8Jf/wVNAAe1zkPXKHnO8woob6/TTZxXQOti6U4hay+qHI+iYvhflQAAAABJRU5ErkJggg==",
  walkL: [
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAeCAYAAAAcni9KAAABEElEQVR4nJ2UMRrCIAyFX/x6CK6BWxk9hmtXj+PK2mM4tpu9Rm8RBwvFJFj0LQW+/I8EUghC7B3LNVpWkmsnuYDhopbYO5aGGqzAMhuqpVdTSrsrJ3y/ZoN5GdH7ax5nLe9PJwEVuCmZTMPIIYI6CZVBNRPAOJxaYKlpAFMaWAHlztLYvo4DKERQ7girVgmFiByvWkmZxMcOn9cMmyDwrrt/OszndU9/m4cIMmu0ICkTPIKmAaxA9o6/Qf3TAdhaDtgPpNYACfhI9egqpEIEnVogudtHqq2AAuk2EnvHPerBpVQDtLwGtKx2A7RIgdZT2AQmuGaQmuPQvay57KimtKwXoulwyh/4J9CC/7qOEEEvfECETZRx9iQAAAAASUVORK5CYII=",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAdCAYAAACjbey/AAABD0lEQVR4nK2UsRGDMAxFpRxDsAZ0ocwYtLSMk5bWo0AXr+EtnIJYkWXLKHf5lU9Yz18yMoJQHPooY+gDyljSrYgsjyIUhz7WwHWAAlHdaR80yXI6HozPmUCHd3AfZlqTfA7sZGKR8FGC7YuL0wbkopPJfLMG4yqaeJVwugA6FGVAcyIPSGWgVr8lmRy0mshvgidmAA6p3sCrPyFjKCDURFyd+r8fYyCQ7Fd2C7g6rNnkEKniGvcFYrJsUX2Y4Fv3TwBZH4ektSyxuzr5yknmINusvAlSmR3ru8DfBLWJVv0X0Hp9k44xlOMs1eqF/COrJaAPaHGjAjhImwHaYzkl1TxtgM1ptGjaQJ1YkwsZewOtEIe2dLcYewAAAABJRU5ErkJggg==",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAeCAYAAAAl+Z4RAAABGElEQVR4nJWUuxXDIAxFRQ5DsAbunDJjuPVKad16jJR2Z9ZgC1IkEKEPEFWxwrt6FrIMkEjeJZozIRqay3FjmfXBUsm7JIFlgAJR3Wl/aEFfx+Jkei4FdIYdZr+U3yVCDbRUyATfyLBj3dN9g+LCUjE+rMFwsCb2BB8XUIoamtCc0AL5NeRrHBQXBwC8kZIYCxkARwXbXj/IFBlEnfFjhTRfDs4pllx+xhCxB5JYCwbQbgQARKDoYL5ct7IIoNU1ED7HHFBRz00FqA6jncCgfilXrU4ivn8MoRNazcHQYiHbqnLQWp6aMyYYcYELsR4MuUAhNtGEaDQQnUb9FgQ3WYwHyfYsmhBN6/toOsghLZK/AC3IMECDvQFGOIfLV0JREwAAAABJRU5ErkJggg==",
  ],
  jumpL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAfCAYAAADupU20AAABPElEQVR4nJVVvbmEIBAc+CjCNryMC68MU9Mr56WmlPFCzaQNu+AF5/KWZUFvIlR2ZvYHNACQfqaEE+YdDL6ApeAtBkiyO3A8mJDGoSIx8VCdOQDw43SpRKSSyKwzKjW/D10yTuLuBrWQCbbH8SFi6Wwx5OeiTlEhuFMH2rPOIT0XGACwvWBVXcBqL3sBEuZjqe6EdKEJPBcY29so320xVO4c/3inkKRMazUFvw//bRXzUU0iLTgJEVAwkWlOqi5w9V4wiWYCnpdmvYXCgVTX4MepKHaZwvyq1Is1C6R1Ybu4SOYXsPzmx+1xqG1uE2g4HXLY3hhX4I7OibRA/yy0SPw4wbyDqa60O+3j06ge5x5km11jXzPQ7wPW+ciuLwlah+qSgPJM6LfWyTMA9EdZ4rKIrV9a/v6VHAO1/w8ORZJ5+cPBqwAAAABJRU5ErkJggg==",
  idleR: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAgCAYAAAAbifjMAAABXElEQVR4nK1VQW6DMBCctXhDhfKJiuTknqq+okK9VCiXKs+Jesut4hk9khza+BcVr2B7IHZsvAZCuyewd2Zn8XghJII3K0bXBWtkWhrmKQnIRR6BUT2JhQICqeoYGAACSUkCCXhpJ/MXj+sWlkAXZb9mavcMALSrg6KuhWarWN8/B8mO2NRXlfuSeV9yRJAC6aIUSS2JAoDTVk327qvwgyxB13WT8v14OPRYNZUskUYKbDSXViZB3klE1uTNivH6GIGOpnaykwqsCv1113vCC33OcVy3EYkagqdOo6nA/ntgpLk29klm+yBFEjlRn/MkSNpT1kRLoqnAWWpzTEmgQFyVBkhiqBC/v4Qf8PA5XnJAlLzOc0PR2wdBLeOhXU0hckq+kON8fctABa5DVY2BybREphVb5CKXnTisAAD0/ZP8Tn8+hcxWiG6jCRP9fwaQmImLFLjL9F/X+db4BQb6rcXj4yYJAAAAAElFTkSuQmCC",
  walkR: [
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAeCAYAAAAl+Z4RAAABUklEQVR4nJ1VO46DMBQcW3uGCO0lVpDKlHuKFS2i2+Oki9JyFGhW+Bo+BS/F5jn+m2Sq8PCMZ3jPjkABdP4k7LtXE9oI91nmiNQ2ERnjd7Q2EkjtmiMDgAgLWYEUWRvxERbXzoAFVDv81/RsfwOA+J3txl6EZZKkvn68xVZYz0+Xl4HoMlAUgQVcQkrMhXWwTLKa3XXBsA5YoGbfRX+DsA766y4gZXJxKUbURnbD3yJLfHQiElgmServ9Cw4A+S2L+mAyWtnbE1tDdbOoL+l3SbPgou1M1Bbg2UEpd7bSSy1kUWoBXEkjuONstqaohMAUI9nnsRkhJJQiGgOagjnJMs46sJrTe4uCNvqXmvRffCqm3roghsAEGH/a63k9xzjUAQ7AwnxqoC7q7V99CMKbQQ0QOf8mEcC4T8Pu/AEdEIgd1xrkO+QlxHEx1v21/2tnRl357GnXjn94gEAAAAASUVORK5CYII=",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAfCAYAAADXwvzvAAABSUlEQVR4nJVUMW7DMAw8EXlDYfQThdPJGvuKwquRrc/JFnj1Mzo6Sxv/ovArzAyOWEqi7PYmUeDxTiRtBwP8+sxYlujOTbPTMaUErquMhO4tKy5ES6VEAgCRLxIt0jS7QwiuxxmB2NTtejcNcgYA9zGIEAHAeCJuXt6jJCk4DXLmc8t8blmsBqJOtIpo0Hii3bdpVbEdiHs2NXwPR/6yOBCZSVt2pUtbyhHh0dlojbJZPoavx2AqNl9P6zwBNLcKACT2PfJdTUmaEAqkIPPWwNiB/020VDeJ1+O8NmjrszKV1GjSMVHJigWuK3lnpPiXAoGcWS2S+88oPFg5MnwMxWIEAO77x4HKfdKLEf52xV3VyRph9UyZPVJGDJatN5lLbqk1tyoqkO6q2VVt1fe/v5fInQ6shNRi0WqKsQOnNjOivyzO99icacAdkPqj80v5NVUAAAAASUVORK5CYII=",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAgCAYAAAAbifjMAAABcklEQVR4nKWVQW6EMAxFnYhDoF5iynQVlnOKCs1mhLqb47Cr2FUco0vYwfQSFafAXQSnDnECav9qJvJ/dmInKIgIX54QlsVbU9OstnFaMmKRB2a4XcREHkDK6sxBqrWqQwDJuG4n44vDeQYCmKKya1PnfgMAqHvnJXWF9W8azenVC3bgqfutsqkQmwoDQMxkikqEEkRT9r298yq4FAfslc9Vttar94IlaFABKVWJZ2KdCEaTg3gF2/ZFAdthGs6zBY25dxewuaK6fyhxCyQz5iIEmysC2DgdM2+NLq4GZ3aAI3NAQDPm3B+fxCToy7Z7mLo0gJceQKYOyhaUjpXvmW8XMI/1f20fFppEFTv5lHg7M3OqwDuVAgDaz10I6U+HSOprjSHgYPa+1giw2IPgk5UC0GBxBY/q8PwdPUgJEIyyGXMxMKbMtXHTSukeSNqdA95zOrgkgCDSd1CsAMC/jTSiR/WvQXKA8n1RoC3LPhjH9QMc/NpV4PHKqAAAAABJRU5ErkJggg==",
  ],
  jumpR: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAgCAYAAAAbifjMAAABqElEQVR4nJ1VS26DMBScZ+UMFcopAlnBqsopItRNxbbHYYu6i6KeoeoyXiXkFBHKIfy6ADvPYBPaWRnZM2/eB5sQAW/XDGOCe9R25NZ2caoUAwb5JYlpAu87QAH0cXA8JclLIMnOAddvDBjo9gAAyNMSAKDbI/LLy2waypIl0UP1ClQ76Ozu1lAApwm7FJZCt0cABnTuyDl4bA72r4krR57uodsvAAZ5uh8cKnBdMtflw4FuD8jTshcxAD5/PBEbxzqw4LpkkgW0LdRZ55HHRCnqtYS3a9abW/BgyEHRgEiSYYyLLjEWAh7z4AnY6LKdNqqcUBukaECTNo5nIU/3fWdGZItFc6A392BqXgoWcjKdwKh4QQe8XTOnCaP5Bsw8Kehg8v8Pv+4zobiATCGSv5cCnW8EFa7p3CUzKaK8XEJE6cabxJjInAtqO1qFScuuNwBYyY/xFMoO6KzzXNgLxRMYo/+JfCF5pQOhSZyZh6Ixk/N0qhTbjaWPicTwLoCBfhZ0dl9Mdg5iVbdFmxXoHcRFimZaJwnVHzL0xyfCF4iJPIvuCfzXyS+poe3hCmm+1wAAAABJRU5ErkJggg==",
};

/* Chargement asynchrone (les Image() se peuplent en arrière-plan ; le rendu
   vérifie .complete avant de dessiner et retombe sur le rendu vectoriel
   existant tant que ce n'est pas prêt — donc aucun flash blanc/cassé). */
const SPRITE_BLOCK = new Image(); SPRITE_BLOCK.src = SPRITE_BLOCK_SRC;
function loadSpriteSet(srcSet){
  const out = {};
  for(const key of Object.keys(srcSet)){
    const v = srcSet[key];
    if(Array.isArray(v)){ out[key] = v.map(s => { const im = new Image(); im.src = s; return im; }); }
    else { const im = new Image(); im.src = v; out[key] = im; }
  }
  return out;
}
const MARIO_SPRITES = loadSpriteSet(MARIO_SPRITE_SRC);
