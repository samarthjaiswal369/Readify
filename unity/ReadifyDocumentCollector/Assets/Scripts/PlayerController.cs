using UnityEngine;

public class PlayerController : MonoBehaviour
{
    public float moveSpeed = 8f;
    public float xLimit = 7.5f;
    public float yLimit = 4.2f;

    private void Update()
    {
        if (GameManager.Instance != null && !GameManager.Instance.IsPlaying())
        {
            return;
        }

        float moveX = Input.GetAxisRaw("Horizontal");
        float moveY = Input.GetAxisRaw("Vertical");

        Vector3 direction = new Vector3(moveX, moveY, 0f);
        if (direction.sqrMagnitude > 1f)
        {
            direction.Normalize();
        }

        transform.position += direction * moveSpeed * Time.deltaTime;

        float clampedX = Mathf.Clamp(transform.position.x, -xLimit, xLimit);
        float clampedY = Mathf.Clamp(transform.position.y, -yLimit, yLimit);
        transform.position = new Vector3(clampedX, clampedY, transform.position.z);
    }
}
